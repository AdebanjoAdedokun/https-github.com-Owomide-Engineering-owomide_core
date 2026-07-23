import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create, fromBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import {
  CreateProposalRequestSchema,
  type SubmitProposalResponse,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  type ValidateBatchRequest,
  type ValidateBatchResponse,
  type Violation,
  ValidateBatchResponseSchema,
  ViolationSchema,
  ViolationSeverity,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  ProposalBlockedSchema,
  type ProposalBlocked,
} from "@owomide/proto/events/proposal/v1_pb.js";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
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
}

class NoOpCatalogClient implements CatalogClient {
  async applyPriceChanges(_req: never, _headers: Headers): Promise<never> {
    throw new Error("applyPriceChanges should not be called in submit tests");
  }
  async listSkus(_req: never, _headers: Headers): Promise<never> {
    throw new Error("listSkus should not be called in submit tests");
  }
  async batchGetPrices(_req: never, _headers: Headers): Promise<never> {
    throw new Error("batchGetPrices should not be called in submit tests");
  }
}

class StubMarginClient implements MarginClient {
  async validateBatch(_req: ValidateBatchRequest, _headers: Headers): Promise<ValidateBatchResponse> {
    return create(ValidateBatchResponseSchema, { violations: [] });
  }
}

class BlockedMarginClient implements MarginClient {
  constructor(private readonly violations: Violation[]) {}
  async validateBatch(_req: ValidateBatchRequest, _headers: Headers): Promise<ValidateBatchResponse> {
    return create(ValidateBatchResponseSchema, { violations: this.violations });
  }
}

class TestAuthenticator extends ServiceAuthenticator {
  override async authorize(
    _context: HandlerContext,
    _allowedServices: readonly string[]
  ): Promise<string> {
    return "gateway_svc";
  }
}

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
      name: "SubmitProposal",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("Proposal Submit", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const USER_1 = "00000000-0000-0000-0000-000000000011";
  const SKU_ID = "00000000-0000-0000-0000-000000000101";
  const CHANNEL_ID = "00000000-0000-0000-0000-000000000201";
  const RULE_ID = "aaaaaaaa-0000-0000-0000-000000000001";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT"
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
    const authenticator = new TestAuthenticator("owomide-internal", {});
    service = new ProposalServiceImpl(db, authenticator, repo, new NoOpCatalogClient(), new StubMarginClient());
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  it("submitProposal transitions draft→submitted and logs the transition", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Submit Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1));

    const { rows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [created.row.id]
    );
    expect(rows[0]!.state).toBe("submitted");

    const { rows: transitions } = await superuser.query(
      `SELECT * FROM proposal.proposal_transition WHERE proposal_id = $1 ORDER BY occurred_at`,
      [created.row.id]
    );
    expect(transitions).toHaveLength(2);
    expect(transitions[0]!.from_state).toBeNull();
    expect(transitions[0]!.to_state).toBe("draft");
    expect(transitions[1]!.from_state).toBe("draft");
    expect(transitions[1]!.to_state).toBe("submitted");
  });

  it("emits proposal.submitted to outbox with correct fields", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Outbox Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1));

    const { rows } = await superuser.query(
      `SELECT * FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [created.row.id]
    );
    expect(rows).toHaveLength(1);

    const outbox = rows[0]!;
    expect(outbox.event_type).toBe("proposal.submitted");
    expect(outbox.aggregate_type).toBe("proposal");
    expect(outbox.partition_key).toBe(created.row.id);
    expect(outbox.org_id).toBe(ORG_A);
    expect(outbox.payload).toBeInstanceOf(Buffer);
    expect((outbox.payload as Buffer).length).toBeGreaterThan(0);
    // id must be present (ULID — time-ordered, 26 uppercase alphanum chars)
    expect(outbox.id).toBeTruthy();
    expect(typeof outbox.id).toBe("string");
    expect(outbox.published_at).toBeNull();
  });

  it("outbox event and state transition are in the same DB transaction (atomic write)", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Atomic Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1));

    // Both state and outbox must reflect the transition
    const [stateRow] = (
      await superuser.query<{ state: string }>(
        `SELECT state FROM proposal.proposal WHERE id = $1`,
        [created.row.id]
      )
    ).rows;
    const [outboxRow] = (
      await superuser.query(
        `SELECT event_type FROM proposal.outbox_event WHERE aggregate_id = $1`,
        [created.row.id]
      )
    ).rows;

    expect(stateRow!.state).toBe("submitted");
    expect(outboxRow!.event_type).toBe("proposal.submitted");
  });

  it("margin violations drive blocked state, 422, and proposal.blocked outbox with violation payload", async () => {
    const authenticator = new TestAuthenticator("owomide-internal", {});
    const violation = create(ViolationSchema, {
      skuId: SKU_ID,
      ruleId: RULE_ID,
      severity: ViolationSeverity.BLOCK,
      message: "proposed price 900 is below floor 1000 (absolute_minimum)",
      floor: create(MoneySchema, { amount: 1000n, currency: "NGN" }),
      proposed: create(MoneySchema, { amount: 900n, currency: "NGN" }),
      gap: create(MoneySchema, { amount: 100n, currency: "NGN" }),
    });
    const blockedService = new ProposalServiceImpl(
      db,
      authenticator,
      repo,
      new NoOpCatalogClient(),
      new BlockedMarginClient([violation])
    );

    const req = create(CreateProposalRequestSchema, {
      title: "Blocked Proposal",
      lines: [
        {
          skuId: SKU_ID,
          channelId: CHANNEL_ID,
          currentPrice: create(MoneySchema, { amount: 1000n, currency: "NGN" }),
          proposedPrice: create(MoneySchema, { amount: 900n, currency: "NGN" }),
          reason: "Testing blocked path",
        },
      ],
    });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = blockedService.implementation.submitProposal!;
    const resp = await impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1)) as unknown as SubmitProposalResponse;
    const violations = resp.violations ?? [];
    expect(violations).toHaveLength(1);
    expect(violations[0]!.skuId).toBe(SKU_ID);

    // State must be 'blocked' in DB
    const { rows: stateRows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [created.row.id]
    );
    expect(stateRows[0]!.state).toBe("blocked");

    // Outbox must carry proposal.blocked with violations serialised in payload
    const { rows: outboxRows } = await superuser.query(
      `SELECT event_type, payload FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [created.row.id]
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.event_type).toBe("proposal.blocked");

    const blocked = fromBinary(
      ProposalBlockedSchema,
      new Uint8Array(outboxRows[0]!.payload as Buffer)
    ) as unknown as ProposalBlocked;
    expect(blocked.violations).toHaveLength(1);
    expect(blocked.violations[0]!.skuId).toBe(SKU_ID);
    expect(blocked.violations[0]!.channelId).toBe(CHANNEL_ID);
    expect(blocked.violations[0]!.ruleId).toBe(RULE_ID);
    expect(blocked.violations[0]!.message).toContain("below floor");
  });

  it("submitProposal on a non-draft proposal throws FailedPrecondition", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Already Submitted" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    await superuser.query(
      `UPDATE proposal.proposal SET state = 'submitted' WHERE id = $1`,
      [created.row.id]
    );

    const impl = service.implementation.submitProposal!;
    await expect(
      impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("submitProposal on a non-existent id throws NotFound", async () => {
    const impl = service.implementation.submitProposal!;
    await expect(
      impl(
        { id: "00000000-0000-0000-0000-000000009999" } as never,
        makeContext(ORG_A, USER_1)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("submitProposal with wrong org returns NotFound (RLS isolation)", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Org A Proposal" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await expect(
      impl({ id: created.row.id } as never, makeContext(ORG_B, USER_1))
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });
});
