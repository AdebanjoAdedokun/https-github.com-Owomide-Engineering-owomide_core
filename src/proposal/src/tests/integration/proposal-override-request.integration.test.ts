import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create, fromBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import { CreateProposalRequestSchema } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { OverrideRequestedSchema } from "@owomide/proto/events/proposal/v1_pb.js";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
import type { CatalogClient } from "../../clients/catalog.js";
import { type MarginClient } from "../../clients/margin.js";

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

class TestAuthenticator extends ServiceAuthenticator {
  override async authorize(
    _context: HandlerContext,
    _allowedServices: readonly string[]
  ): Promise<string> {
    return "gateway_svc";
  }
}

class NoOpCatalogClient implements CatalogClient {
  async applyPriceChanges(_req: never, _headers: Headers): Promise<never> {
    throw new Error("applyPriceChanges should not be called in override-request tests");
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in override-request tests"));
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
      name: "RequestOverride",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("RequestOverride", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const REQUESTER = "00000000-0000-0000-0000-000000000011";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_override_request_test")
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
    service = new ProposalServiceImpl(
      db,
      authenticator,
      repo,
      new NoOpCatalogClient(),
      new StubMarginClient()
    );
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  async function createBlockedProposal(orgId: string, ownerId: string): Promise<string> {
    const req = create(CreateProposalRequestSchema, { title: "Override Request Test" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, ownerId, req)
    );
    await superuser.query(
      `UPDATE proposal.proposal SET state = 'blocked' WHERE id = $1`,
      [created.row.id]
    );
    return created.row.id;
  }

  it("creates override_request row and writes override.requested outbox event", async () => {
    const proposalId = await createBlockedProposal(ORG_A, REQUESTER);
    const justification = "Customer requires this price for contract renewal";

    const impl = service.implementation.requestOverride!;
    const resp = await impl(
      { proposalId, justification } as never,
      makeContext(ORG_A, REQUESTER)
    );

    // Response contains the new override request
    expect(resp.overrideRequest).toBeDefined();
    expect(resp.overrideRequest!.status).toBe("pending");
    expect(resp.overrideRequest!.requesterId).toBe(REQUESTER);
    expect(resp.overrideRequest!.proposalId).toBe(proposalId);
    expect(resp.overrideRequest!.justification).toBe(justification);
    expect(resp.overrideRequest!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // DB row: status=pending, decided_at and decider_id are null
    const { rows: overrideRows } = await superuser.query(
      `SELECT requester_id, justification, status, decided_at, decider_id
       FROM proposal.override_request WHERE proposal_id = $1`,
      [proposalId]
    );
    expect(overrideRows).toHaveLength(1);
    expect(overrideRows[0]!.requester_id).toBe(REQUESTER);
    expect(overrideRows[0]!.justification).toBe(justification);
    expect(overrideRows[0]!.status).toBe("pending");
    expect(overrideRows[0]!.decided_at).toBeNull();
    expect(overrideRows[0]!.decider_id).toBeNull();

    // Outbox event: override.requested, partition_key=proposalId, unpublished
    const { rows: outboxRows } = await superuser.query(
      `SELECT event_type, partition_key, org_id, payload, published_at
       FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [proposalId]
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.event_type).toBe("override.requested");
    expect(outboxRows[0]!.partition_key).toBe(proposalId);
    expect(outboxRows[0]!.org_id).toBe(ORG_A);
    expect(outboxRows[0]!.published_at).toBeNull();

    // Decode payload and verify embedded fields
    const event = fromBinary(
      OverrideRequestedSchema,
      new Uint8Array(outboxRows[0]!.payload as Buffer)
    );
    expect(event.proposalId).toBe(proposalId);
    expect(event.requesterId).toBe(REQUESTER);
    expect(event.overrideRequestId).toBe(resp.overrideRequest!.id);
    expect(event.justification).toBe(justification);
  });

  it("proposal state remains blocked after override request", async () => {
    const proposalId = await createBlockedProposal(ORG_A, REQUESTER);

    const impl = service.implementation.requestOverride!;
    await impl(
      { proposalId, justification: "price exception needed" } as never,
      makeContext(ORG_A, REQUESTER)
    );

    const { rows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [proposalId]
    );
    expect(rows[0]!.state).toBe("blocked");
  });

  it("returns FailedPrecondition when proposal is not blocked", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Draft Proposal" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, REQUESTER, req)
    );

    const impl = service.implementation.requestOverride!;
    await expect(
      impl(
        { proposalId: created.row.id, justification: "exception needed" } as never,
        makeContext(ORG_A, REQUESTER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("returns InvalidArgument when justification is blank", async () => {
    const proposalId = await createBlockedProposal(ORG_A, REQUESTER);

    const impl = service.implementation.requestOverride!;
    await expect(
      impl(
        { proposalId, justification: "   " } as never,
        makeContext(ORG_A, REQUESTER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument
    );
  });

  it("returns NotFound when proposal does not exist", async () => {
    const impl = service.implementation.requestOverride!;
    await expect(
      impl(
        { proposalId: "00000000-0000-0000-0000-999999999999", justification: "exception" } as never,
        makeContext(ORG_A, REQUESTER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("returns NotFound for proposal from a different org (RLS isolation)", async () => {
    const proposalId = await createBlockedProposal(ORG_A, REQUESTER);

    const impl = service.implementation.requestOverride!;
    await expect(
      impl(
        { proposalId, justification: "exception needed" } as never,
        makeContext(ORG_B, REQUESTER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });
});
