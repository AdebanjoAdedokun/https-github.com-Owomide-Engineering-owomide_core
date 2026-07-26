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
  type ApproveOverrideResponse,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  OverrideApprovedSchema,
  type OverrideApproved,
} from "@owomide/proto/events/override/v1_pb.js";
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
    throw new Error("applyPriceChanges should not be called in override-approve tests");
  }
  async listSkus(_req: never, _headers: Headers): Promise<never> {
    throw new Error("listSkus should not be called in override-approve tests");
  }
  async batchGetPrices(_req: never, _headers: Headers): Promise<never> {
    throw new Error("batchGetPrices should not be called in override-approve tests");
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in override-approve tests"));
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
      name: "ApproveOverride",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

function makeApproverContext(orgId: string, userId: string): HandlerContext {
  const headers = new Headers();
  headers.set("x-org-id", orgId);
  headers.set("x-user-id", userId);
  headers.set("x-user-roles", "approver");
  return {
    requestHeader: headers,
    responseHeader: new Headers(),
    responseTrailer: new Headers(),
    signal: new AbortController().signal,
    values: new Map(),
    peer: { addr: "test", protocol: "http2" },
    method: {
      name: "ApproveOverride",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("ApproveOverride", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const REQUESTER = "00000000-0000-0000-0000-000000000011";
  const DECIDER = "00000000-0000-0000-0000-000000000022";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_override_approve_test")
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

  async function seedOverrideRequest(
    orgId: string,
    requesterId: string
  ): Promise<{ proposalId: string; overrideRequestId: string }> {
    const req = create(CreateProposalRequestSchema, { title: "Override Approve Test" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, requesterId, req)
    );
    const proposalId = created.row.id;

    await superuser.query(
      `UPDATE proposal.proposal SET state = 'blocked' WHERE id = $1`,
      [proposalId]
    );

    const { rows } = await superuser.query<{ id: string }>(
      `INSERT INTO proposal.override_request
         (org_id, proposal_id, requester_id, justification, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [orgId, proposalId, requesterId, "Customer requires this price for contract renewal"]
    );
    return { proposalId, overrideRequestId: rows[0]!.id };
  }

  it("approves override: proposal becomes approved, override_request stamped, outbox event written", async () => {
    const { proposalId, overrideRequestId } = await seedOverrideRequest(ORG_A, REQUESTER);

    const impl = service.implementation.approveOverride!;
    const resp = await impl(
      { overrideRequestId } as never,
      makeApproverContext(ORG_A, DECIDER)
    ) as unknown as ApproveOverrideResponse;

    // Response: proposal is populated
    expect(resp.proposal).toBeDefined();

    // DB: proposal state
    const { rows: proposalRows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [proposalId]
    );
    expect(proposalRows[0]!.state).toBe("approved");

    // DB: override_request stamped
    const { rows: overrideRows } = await superuser.query(
      `SELECT status, decider_id, decided_at FROM proposal.override_request WHERE id = $1`,
      [overrideRequestId]
    );
    expect(overrideRows[0]!.status).toBe("approved");
    expect(overrideRows[0]!.decider_id).toBe(DECIDER);
    expect(overrideRows[0]!.decided_at).not.toBeNull();

    // DB: transition log entry
    const { rows: transRows } = await superuser.query(
      `SELECT from_state, to_state, actor_id, meta FROM proposal.proposal_transition
       WHERE proposal_id = $1 AND to_state = 'approved'`,
      [proposalId]
    );
    expect(transRows).toHaveLength(1);
    expect(transRows[0]!.from_state).toBe("blocked");
    expect(transRows[0]!.actor_id).toBe(DECIDER);

    // Outbox: override.approved event
    const { rows: outboxRows } = await superuser.query(
      `SELECT event_type, partition_key, org_id, payload, published_at
       FROM proposal.outbox_event WHERE aggregate_id = $1 AND event_type = 'override.approved'`,
      [proposalId]
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.event_type).toBe("override.approved");
    expect(outboxRows[0]!.partition_key).toBe(proposalId);
    expect(outboxRows[0]!.org_id).toBe(ORG_A);
    expect(outboxRows[0]!.published_at).toBeNull();

    // Decode payload
    const event = fromBinary(
      OverrideApprovedSchema,
      new Uint8Array(outboxRows[0]!.payload as Buffer)
    ) as unknown as OverrideApproved;
    expect(event.proposalId).toBe(proposalId);
    expect(event.overrideRequestId).toBe(overrideRequestId);
    expect(event.approverId).toBe(DECIDER);
    expect(event.requesterId).toBe(REQUESTER);
  });

  it("returns PermissionDenied when decider is the same actor as requester", async () => {
    const { overrideRequestId } = await seedOverrideRequest(ORG_A, REQUESTER);

    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId } as never,
        makeApproverContext(ORG_A, REQUESTER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.PermissionDenied
    );
  });

  it("returns PermissionDenied when caller lacks approver role", async () => {
    const { overrideRequestId } = await seedOverrideRequest(ORG_A, REQUESTER);

    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId } as never,
        makeContext(ORG_A, DECIDER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.PermissionDenied
    );
  });

  it("returns NotFound when override request does not exist", async () => {
    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId: "00000000-0000-0000-0000-999999999999" } as never,
        makeApproverContext(ORG_A, DECIDER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("returns FailedPrecondition when override request is already decided", async () => {
    const { overrideRequestId } = await seedOverrideRequest(ORG_A, REQUESTER);
    await superuser.query(
      `UPDATE proposal.override_request
       SET status = 'approved', decider_id = $1, decided_at = clock_timestamp()
       WHERE id = $2`,
      [DECIDER, overrideRequestId]
    );

    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId } as never,
        makeApproverContext(ORG_A, DECIDER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("returns FailedPrecondition when proposal is not blocked", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Draft Proposal" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, REQUESTER, req)
    );
    const proposalId = created.row.id;

    const { rows } = await superuser.query<{ id: string }>(
      `INSERT INTO proposal.override_request
         (org_id, proposal_id, requester_id, justification, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [ORG_A, proposalId, REQUESTER, "exception needed"]
    );
    const overrideRequestId = rows[0]!.id;

    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId } as never,
        makeApproverContext(ORG_A, DECIDER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("returns NotFound for override request from a different org (RLS isolation)", async () => {
    const { overrideRequestId } = await seedOverrideRequest(ORG_A, REQUESTER);

    const impl = service.implementation.approveOverride!;
    await expect(
      impl(
        { overrideRequestId } as never,
        makeApproverContext(ORG_B, DECIDER)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });
});
