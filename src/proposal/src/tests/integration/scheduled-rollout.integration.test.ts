import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import {
  ScheduleRolloutRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  type ListSkusRequest,
  type ListSkusResponse,
  ListSkusResponseSchema,
  type BatchGetPricesRequest,
  type BatchGetPricesResponse,
  BatchGetPricesResponseSchema,
  type ApplyPriceChangesRequest,
  type ApplyPriceChangesResponse,
  ApplyPriceChangesResponseSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
import { ScheduledRolloutWorker } from "../../workers/scheduled-rollout.js";
import type { CatalogClient } from "../../clients/catalog.js";
import type { MarginClient } from "../../clients/margin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS proposal");
  await client.query("GRANT USAGE ON SCHEMA proposal TO proposal_svc");
  await client.query(sql("0001_create_schema.up.sql"));
  await client.query(sql("0002_proposal_foundation.up.sql"));
  await client.query(sql("0003_scheduled_rollout_claim_fn.up.sql"));
}

class TestAuthenticator extends ServiceAuthenticator {
  override async authorize(
    _context: HandlerContext,
    _allowedServices: readonly string[],
  ): Promise<string> {
    return "gateway_svc";
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in scheduled-rollout tests"));
}

class StubCatalogClient implements CatalogClient {
  readonly applyCalls: ApplyPriceChangesRequest[] = [];

  constructor(private readonly shouldFailApply = false) {}

  async listSkus(_req: ListSkusRequest, _headers: Headers): Promise<ListSkusResponse> {
    return create(ListSkusResponseSchema, { skus: [] });
  }
  async batchGetPrices(_req: BatchGetPricesRequest, _headers: Headers): Promise<BatchGetPricesResponse> {
    return create(BatchGetPricesResponseSchema, { prices: [] });
  }
  async applyPriceChanges(req: ApplyPriceChangesRequest, _headers: Headers): Promise<ApplyPriceChangesResponse> {
    if (this.shouldFailApply) throw new Error("catalog unavailable");
    this.applyCalls.push(req);
    return create(ApplyPriceChangesResponseSchema, { results: req.changes.map((change) => ({ sourceItemRef: change.proposalLineId, skuId: change.skuId, status: 2, priceRecordIds: [`price-${change.proposalLineId}`] })) });
  }
}

const ORG_ID  = "00000000-0000-0000-0000-000000000099";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const SKU_ID  = "00000000-0000-0000-0000-000000000011";
const CHANNEL_ID = "00000000-0000-0000-0000-000000000001";

function makeContext(orgId: string, userId: string): HandlerContext {
  const headers = new Headers();
  headers.set("x-org-id", orgId);
  headers.set("x-user-id", userId);
  return {
    requestHeader: headers,
    responseHeader: new Headers(),
    responseTrailer: new Headers(),
    signal: new AbortController().signal,
    values: new Map(),
    peer: { addr: "test", protocol: "http2" },
    method: {
      name: "ScheduleRollout",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

function futureTimestamp(offsetMs = 60_000) {
  const d = new Date(Date.now() + offsetMs);
  const seconds = BigInt(Math.floor(d.getTime() / 1000));
  return create(TimestampSchema, { seconds, nanos: 0 });
}

async function seedApprovedProposal(
  superuser: pg.Client,
  orgId: string,
  actorId: string,
): Promise<string> {
  const { rows } = await superuser.query<{ id: string }>(
    `INSERT INTO proposal.proposal (org_id, state, actor_id, title)
     VALUES ($1, 'approved', $2, 'Test proposal')
     RETURNING id`,
    [orgId, actorId],
  );
  const proposalId = rows[0]!.id;
  await superuser.query(
    `INSERT INTO proposal.proposal_line
       (org_id, proposal_id, sku_id, channel_id,
        current_price_minor, current_price_currency,
        proposed_price_minor, proposed_price_currency, reason)
     VALUES ($1, $2, $3, $4, 100000, 'NGN', 105000, 'NGN', '')`,
    [orgId, proposalId, SKU_ID, CHANNEL_ID],
  );
  return proposalId;
}

describe("ScheduleRollout", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_scheduled_rollout_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT",
    );
    await applyMigrations(superuser);

    db = new Database({
      databaseUrl: container
        .getConnectionUri()
        .replace("postgres:postgres@", "proposal_svc:test-password@"),
      databasePoolSize: 5,
      databaseStatementTimeoutMs: 15_000,
    });
    repo = new ProposalRepository();
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  function makeService(catalogClient: CatalogClient) {
    return new ProposalServiceImpl(
      db,
      new TestAuthenticator("owomide-internal", {}),
      repo,
      catalogClient,
      new StubMarginClient(),
    );
  }

  function makeWorker(catalogClient: CatalogClient) {
    return new ScheduledRolloutWorker(
      db.pool,
      db,
      repo,
      catalogClient,
      { catalogServiceSecret: "", serviceJwtIssuer: "owomide-internal" },
      pino({ level: "silent" }),
    );
  }

  // ── Handler tests ──────────────────────────────────────────────────────────

  it("handler: happy path — seeds pending rollout for approved proposal", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);
    const service = makeService(new StubCatalogClient());
    const ctx = makeContext(ORG_ID, USER_ID);

    const resp = await service.implementation.scheduleRollout!(
      create(ScheduleRolloutRequestSchema, {
        proposalId,
        effectiveAt: futureTimestamp(),
      }) as never,
      ctx,
    ) as { proposal: { id: string; state: number } };

    expect(resp.proposal.id).toBe(proposalId);
    expect(resp.proposal.state).toBe(4); // APPROVED = 4

    const { rows } = await superuser.query<{ status: string }>(
      "SELECT status FROM proposal.scheduled_rollout WHERE proposal_id = $1",
      [proposalId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
  });

  it("handler: draft proposal returns FailedPrecondition", async () => {
    const { rows } = await superuser.query<{ id: string }>(
      `INSERT INTO proposal.proposal (org_id, state, actor_id, title)
       VALUES ($1, 'draft', $2, 'Draft proposal')
       RETURNING id`,
      [ORG_ID, USER_ID],
    );
    const proposalId = rows[0]!.id;
    const service = makeService(new StubCatalogClient());

    await expect(
      service.implementation.scheduleRollout!(
        create(ScheduleRolloutRequestSchema, {
          proposalId,
          effectiveAt: futureTimestamp(),
        }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition,
    );
  });

  it("handler: missing effectiveAt returns InvalidArgument", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);
    const service = makeService(new StubCatalogClient());

    await expect(
      service.implementation.scheduleRollout!(
        create(ScheduleRolloutRequestSchema, { proposalId }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
    );
  });

  it("handler: duplicate pending rollout returns AlreadyExists", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);
    const service = makeService(new StubCatalogClient());
    const ctx = makeContext(ORG_ID, USER_ID);
    const req = create(ScheduleRolloutRequestSchema, {
      proposalId,
      effectiveAt: futureTimestamp(),
    }) as never;

    // First call succeeds
    await service.implementation.scheduleRollout!(req, ctx);

    // Second call must fail — duplicate pending row
    await expect(
      service.implementation.scheduleRollout!(req, ctx),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.AlreadyExists,
    );
  });

  // ── Worker tests ───────────────────────────────────────────────────────────

  it("worker: dispatches due rollout — proposal published, rollout dispatched, outbox inserted", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);

    // Seed a past-effective_at pending rollout directly
    await superuser.query(
      `INSERT INTO proposal.scheduled_rollout
         (org_id, proposal_id, effective_at, status)
       VALUES ($1, $2, now() - interval '1 hour', 'pending')`,
      [ORG_ID, proposalId],
    );

    const catalogStub = new StubCatalogClient();
    const worker = makeWorker(catalogStub);
    await worker.runOnce();

    const { rows: proposalRows } = await superuser.query<{ state: string }>(
      "SELECT state FROM proposal.proposal WHERE id = $1",
      [proposalId],
    );
    expect(proposalRows[0]!.state).toBe("published");

    const { rows: rolloutRows } = await superuser.query<{ status: string }>(
      "SELECT status FROM proposal.scheduled_rollout WHERE proposal_id = $1",
      [proposalId],
    );
    expect(rolloutRows[0]!.status).toBe("dispatched");

    const { rows: outboxRows } = await superuser.query<{ event_type: string }>(
      "SELECT event_type FROM proposal.outbox_event WHERE aggregate_id = $1",
      [proposalId],
    );
    expect(outboxRows.some((r) => r.event_type === "proposal.published")).toBe(true);

    expect(catalogStub.applyCalls).toHaveLength(1);
    expect(catalogStub.applyCalls[0]!.proposalId).toBe(proposalId);
  });

  it("worker: future rollout not dispatched — proposal stays approved", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);

    await superuser.query(
      `INSERT INTO proposal.scheduled_rollout
         (org_id, proposal_id, effective_at, status)
       VALUES ($1, $2, now() + interval '1 hour', 'pending')`,
      [ORG_ID, proposalId],
    );

    const worker = makeWorker(new StubCatalogClient());
    await worker.runOnce();

    const { rows } = await superuser.query<{ state: string }>(
      "SELECT state FROM proposal.proposal WHERE id = $1",
      [proposalId],
    );
    expect(rows[0]!.state).toBe("approved");

    const { rows: rolloutRows } = await superuser.query<{ status: string }>(
      "SELECT status FROM proposal.scheduled_rollout WHERE proposal_id = $1",
      [proposalId],
    );
    expect(rolloutRows[0]!.status).toBe("pending");
  });

  it("worker: permanently fails rollout after max attempts — no Catalog call, proposal stays approved", async () => {
    const proposalId = await seedApprovedProposal(superuser, ORG_ID, USER_ID);

    // Seed a due rollout with attempts already at MAX_ATTEMPTS (5).
    // claim_due_rollouts increments to 6 before returning, so row.attempts > 5 → mark_rollout_failed.
    await superuser.query(
      `INSERT INTO proposal.scheduled_rollout
         (org_id, proposal_id, effective_at, status, attempts)
       VALUES ($1, $2, now() - interval '1 hour', 'pending', 5)`,
      [ORG_ID, proposalId],
    );

    const catalogStub = new StubCatalogClient();
    const worker = makeWorker(catalogStub);
    await worker.runOnce();

    const { rows: rolloutRows } = await superuser.query<{ status: string }>(
      "SELECT status FROM proposal.scheduled_rollout WHERE proposal_id = $1",
      [proposalId],
    );
    expect(rolloutRows[0]!.status).toBe("failed");

    expect(catalogStub.applyCalls).toHaveLength(0);

    const { rows: proposalRows } = await superuser.query<{ state: string }>(
      "SELECT state FROM proposal.proposal WHERE id = $1",
      [proposalId],
    );
    expect(proposalRows[0]!.state).toBe("approved");
  });
});
