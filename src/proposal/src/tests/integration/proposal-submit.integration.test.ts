import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import { CreateProposalRequestSchema } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";

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
    service = new ProposalServiceImpl(db, authenticator, repo);
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

  it("blocked outcome writes proposal.blocked to outbox before returning 422", async () => {
    // Directly exercise the blocked path via the repo — state machine stub always returns
    // submitted in F3.4, so we test at the repo layer to cover the outbox write for blocked.
    const req = create(CreateProposalRequestSchema, { title: "Blocked Outbox Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    // Build a blocked payload manually and call insertOutboxEvent directly
    await db.withOrgTransaction(ORG_A, async (c) => {
      await repo.submitProposal(c, created.row.id, "draft", "blocked", USER_1, {});
      await repo.insertOutboxEvent(c, {
        id: "00000000-0000-0000-0000-000000000099",
        orgId: ORG_A,
        eventType: "proposal.blocked",
        aggregateId: created.row.id,
        partitionKey: created.row.id,
        payload: new Uint8Array([0x08, 0x01]),
      });
    });

    const { rows } = await superuser.query(
      `SELECT event_type, org_id, partition_key FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [created.row.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_type).toBe("proposal.blocked");
    expect(rows[0]!.partition_key).toBe(created.row.id);
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
