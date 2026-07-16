import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import { CreateProposalRequestSchema } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import type { Event, Publisher } from "@owomide/bus";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
import type { CatalogClient } from "../../clients/catalog.js";
import { OutboxRelay } from "../../workers/outbox-relay.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS proposal");
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
  async applyPriceChanges(): Promise<never> {
    throw new Error("applyPriceChanges should not be called in approve tests");
  }
}

class MockPublisher implements Publisher {
  readonly calls: Array<{ topic: string; event: Event }> = [];
  shouldFail = false;

  async publish(topic: string, event: Event): Promise<void> {
    if (this.shouldFail) throw new Error("kafka unavailable");
    this.calls.push({ topic, event });
  }

  async close(): Promise<void> {}
}

function makeContext(orgId: string, userId: string, roles: string[] = []): HandlerContext {
  const headers = new Headers();
  headers.set("x-org-id", orgId);
  headers.set("x-user-id", userId);
  if (roles.length > 0) headers.set("x-user-roles", roles.join(","));
  return {
    requestHeader: headers,
    responseHeader: new Headers(),
    responseTrailer: new Headers(),
    signal: new AbortController().signal,
    values: new Map(),
    peer: { addr: "test", protocol: "http2" },
    method: {
      name: "ApproveProposal",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

const logger = pino({ level: "silent" });

describe("Proposal Approve", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const OWNER = "00000000-0000-0000-0000-000000000011";
  const APPROVER = "00000000-0000-0000-0000-000000000022";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_approve_test")
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
    service = new ProposalServiceImpl(db, authenticator, repo, new NoOpCatalogClient());
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  async function createSubmittedProposal(orgId: string, ownerId: string): Promise<string> {
    const req = create(CreateProposalRequestSchema, { title: "Approve Test" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, ownerId, req)
    );
    // Force state to submitted directly to avoid needing margin stub
    await superuser.query(
      `UPDATE proposal.proposal SET state = 'submitted' WHERE id = $1`,
      [created.row.id]
    );
    return created.row.id;
  }

  it("approves a submitted proposal and writes transition + outbox event", async () => {
    const proposalId = await createSubmittedProposal(ORG_A, OWNER);

    const impl = service.implementation.approveProposal!;
    await impl({ id: proposalId } as never, makeContext(ORG_A, APPROVER, ["approver"]));

    const { rows: stateRows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [proposalId]
    );
    expect(stateRows[0]!.state).toBe("approved");

    const { rows: transitions } = await superuser.query(
      `SELECT from_state, to_state FROM proposal.proposal_transition WHERE proposal_id = $1 ORDER BY occurred_at`,
      [proposalId]
    );
    const approve = transitions.find((t) => t.to_state === "approved");
    expect(approve).toBeDefined();
    expect(approve!.from_state).toBe("submitted");

    const { rows: outboxRows } = await superuser.query(
      `SELECT event_type, partition_key, org_id FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [proposalId]
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.event_type).toBe("proposal.approved");
    expect(outboxRows[0]!.partition_key).toBe(proposalId);
    expect(outboxRows[0]!.org_id).toBe(ORG_A);
  });

  it("relays proposal.approved via OutboxRelay to MockPublisher", async () => {
    const proposalId = await createSubmittedProposal(ORG_A, OWNER);

    const impl = service.implementation.approveProposal!;
    await impl({ id: proposalId } as never, makeContext(ORG_A, APPROVER, ["approver"]));

    const publisher = new MockPublisher();
    const relay = new OutboxRelay(db.pool, publisher, logger);
    await relay.runOnce();

    const call = publisher.calls.find((c) => c.topic === "proposal.approved");
    expect(call).toBeDefined();
    expect(call!.topic).toBe("proposal.approved");
    expect(call!.event.partitionKey).toBe(proposalId);

    // Confirm it was marked published
    const { rows } = await superuser.query(
      `SELECT published_at FROM proposal.outbox_event WHERE aggregate_id = $1 AND event_type = 'proposal.approved'`,
      [proposalId]
    );
    expect(rows[0]!.published_at).not.toBeNull();
  });

  it("rejects approval when approver is the same actor as the proposal owner", async () => {
    const proposalId = await createSubmittedProposal(ORG_A, OWNER);

    const impl = service.implementation.approveProposal!;
    await expect(
      impl({ id: proposalId } as never, makeContext(ORG_A, OWNER, ["approver"]))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.PermissionDenied
    );
  });

  it("rejects approval when caller does not have the approver role", async () => {
    const proposalId = await createSubmittedProposal(ORG_A, OWNER);

    const impl = service.implementation.approveProposal!;
    await expect(
      impl({ id: proposalId } as never, makeContext(ORG_A, APPROVER, []))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.PermissionDenied
    );
  });

  it("rejects approval when proposal is not in submitted state", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Draft Approve Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, OWNER, req)
    );

    const impl = service.implementation.approveProposal!;
    await expect(
      impl({ id: created.row.id } as never, makeContext(ORG_A, APPROVER, ["approver"]))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("returns NotFound when approving from the wrong org (RLS isolation)", async () => {
    const proposalId = await createSubmittedProposal(ORG_A, OWNER);

    const impl = service.implementation.approveProposal!;
    await expect(
      impl({ id: proposalId } as never, makeContext(ORG_B, APPROVER, ["approver"]))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.NotFound
    );
  });
});
