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
import {
  CreateProposalRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  ApplyPriceChangesResponseSchema,
  type ApplyPriceChangesRequest,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import type { Event, Publisher } from "@owomide/bus";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
import { OutboxRelay } from "../../workers/outbox-relay.js";
import type { CatalogClient } from "../../clients/catalog.js";

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

class MockPublisher implements Publisher {
  readonly calls: Array<{ topic: string; event: Event }> = [];

  async publish(topic: string, event: Event): Promise<void> {
    this.calls.push({ topic, event });
  }

  async close(): Promise<void> {}
}

class MockCatalogClient implements CatalogClient {
  readonly calls: ApplyPriceChangesRequest[] = [];
  shouldFail = false;

  async applyPriceChanges(req: ApplyPriceChangesRequest, _headers: Headers) {
    if (this.shouldFail) {
      throw new ConnectError("Catalog unavailable", Code.Unavailable);
    }
    this.calls.push(req);
    return create(ApplyPriceChangesResponseSchema, {
      operationId: "mock-op",
      replayed: false,
      results: [],
    });
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
      name: "PublishProposal",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

const logger = pino({ level: "silent" });

describe("Proposal Publish", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let catalogClient: MockCatalogClient;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const OWNER = "00000000-0000-0000-0000-000000000011";
  const PUBLISHER = "00000000-0000-0000-0000-000000000033";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_publish_test")
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
    catalogClient = new MockCatalogClient();
    const authenticator = new TestAuthenticator("owomide-internal", {});
    service = new ProposalServiceImpl(db, authenticator, repo, catalogClient);
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  async function createApprovedProposal(orgId: string, ownerId: string): Promise<string> {
    const req = create(CreateProposalRequestSchema, { title: "Publish Test" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, ownerId, req)
    );
    await superuser.query(
      `UPDATE proposal.proposal SET state = 'approved' WHERE id = $1`,
      [created.row.id]
    );
    return created.row.id;
  }

  it("publishes an approved proposal and writes transition + outbox event", async () => {
    const proposalId = await createApprovedProposal(ORG_A, OWNER);
    catalogClient.calls.length = 0;

    const impl = service.implementation.publishProposal!;
    await impl({ id: proposalId } as never, makeContext(ORG_A, PUBLISHER));

    const { rows: stateRows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [proposalId]
    );
    expect(stateRows[0]!.state).toBe("published");

    const { rows: transitions } = await superuser.query(
      `SELECT from_state, to_state FROM proposal.proposal_transition WHERE proposal_id = $1 ORDER BY occurred_at`,
      [proposalId]
    );
    const publish = transitions.find((t) => t.to_state === "published");
    expect(publish).toBeDefined();
    expect(publish!.from_state).toBe("approved");

    const { rows: outboxRows } = await superuser.query(
      `SELECT event_type, partition_key, org_id FROM proposal.outbox_event WHERE aggregate_id = $1`,
      [proposalId]
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.event_type).toBe("proposal.published");
    expect(outboxRows[0]!.partition_key).toBe(proposalId);
    expect(outboxRows[0]!.org_id).toBe(ORG_A);

    expect(catalogClient.calls).toHaveLength(1);
    expect(catalogClient.calls[0]!.proposalId).toBe(proposalId);
  });

  it("relays proposal.published via OutboxRelay to MockPublisher", async () => {
    const proposalId = await createApprovedProposal(ORG_A, OWNER);
    catalogClient.calls.length = 0;

    const impl = service.implementation.publishProposal!;
    await impl({ id: proposalId } as never, makeContext(ORG_A, PUBLISHER));

    const publisher = new MockPublisher();
    const relay = new OutboxRelay(db.pool, publisher, logger);
    await relay.runOnce();

    const call = publisher.calls.find(
      (c) => c.topic === "proposal.published" && c.event.partitionKey === proposalId
    );
    expect(call).toBeDefined();
    expect(call!.event.partitionKey).toBe(proposalId);

    const { rows } = await superuser.query(
      `SELECT published_at FROM proposal.outbox_event WHERE aggregate_id = $1 AND event_type = 'proposal.published'`,
      [proposalId]
    );
    expect(rows[0]!.published_at).not.toBeNull();
  });

  it("rejects publish when proposal is not in approved state", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Draft Publish Test" });
    const created = await db.withOrgTransaction(ORG_A, (c) =>
      repo.createProposal(c, ORG_A, OWNER, req)
    );

    const impl = service.implementation.publishProposal!;
    await expect(
      impl({ id: created.row.id } as never, makeContext(ORG_A, PUBLISHER))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.FailedPrecondition
    );
  });

  it("returns NotFound when publishing from the wrong org (RLS isolation)", async () => {
    const proposalId = await createApprovedProposal(ORG_A, OWNER);

    const impl = service.implementation.publishProposal!;
    await expect(
      impl({ id: proposalId } as never, makeContext(ORG_B, PUBLISHER))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("leaves proposal in approved state when Catalog call fails", async () => {
    const proposalId = await createApprovedProposal(ORG_A, OWNER);
    catalogClient.shouldFail = true;

    const impl = service.implementation.publishProposal!;
    await expect(
      impl({ id: proposalId } as never, makeContext(ORG_A, PUBLISHER))
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.Unavailable
    );

    const { rows } = await superuser.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [proposalId]
    );
    expect(rows[0]!.state).toBe("approved");

    catalogClient.shouldFail = false;
  });

  it("passes proposalId as idempotencyKey to Catalog", async () => {
    const proposalId = await createApprovedProposal(ORG_A, OWNER);
    catalogClient.calls.length = 0;

    const impl = service.implementation.publishProposal!;
    await impl({ id: proposalId } as never, makeContext(ORG_A, PUBLISHER));

    expect(catalogClient.calls[0]!.idempotencyKey).toBe(proposalId);
    expect(catalogClient.calls[0]!.proposalId).toBe(proposalId);
  });
});
