import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { CreateProposalRequestSchema } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { type Publisher, type Event } from "@owomide/bus";
import { type HandlerContext } from "@connectrpc/connect";
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

class TestPublisher implements Publisher {
  readonly captured: Array<{ topic: string; event: Event }> = [];
  async publish(topic: string, event: Event): Promise<void> {
    this.captured.push({ topic, event });
  }
  async close(): Promise<void> {}
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
    method: { name: "SubmitProposal", kind: 0, idempotency: 0, input: {} as never, output: {} as never },
  } as unknown as HandlerContext;
}

describe("Proposal Submit", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let publisher: TestPublisher;
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
    publisher = new TestPublisher();
    const authenticator = new TestAuthenticator("owomide-internal", {});
    service = new ProposalServiceImpl(db, authenticator, repo, publisher);
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  it("submitProposal transitions a draft to submitted and logs the transition", async () => {
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

  it("emits proposal.submitted event with correct topic and partition key", async () => {
    const capturedBefore = publisher.captured.length;

    const req = create(CreateProposalRequestSchema, { title: "Event Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await impl({ id: created.row.id } as never, makeContext(ORG_A, USER_1));

    const emitted = publisher.captured.slice(capturedBefore);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.topic).toBe("proposal.submitted");
    expect(emitted[0]!.event.type).toBe("proposal.submitted");
    expect(emitted[0]!.event.partitionKey).toBe(created.row.id);
    expect(emitted[0]!.event.payload).toBeInstanceOf(Uint8Array);
    expect(emitted[0]!.event.payload.length).toBeGreaterThan(0);
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
    ).rejects.toThrow(/submitted/);
  });

  it("submitProposal on a non-existent id throws NotFound", async () => {
    const impl = service.implementation.submitProposal!;
    await expect(
      impl(
        { id: "00000000-0000-0000-0000-000000009999" } as never,
        makeContext(ORG_A, USER_1)
      )
    ).rejects.toThrow(/not found/i);
  });

  it("submitProposal with wrong org returns NotFound (RLS isolation)", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Org A Proposal" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, USER_1, req)
    );

    const impl = service.implementation.submitProposal!;
    await expect(
      impl({ id: created.row.id } as never, makeContext(ORG_B, USER_1))
    ).rejects.toThrow(/not found/i);
  });
});
