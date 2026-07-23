import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import {
  CreateProposalRequestSchema,
  type AddCommentResponse,
  type ListCommentsResponse,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
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

class NoOpCatalogClient implements CatalogClient {
  async applyPriceChanges(_req: never, _headers: Headers): Promise<never> {
    throw new Error("applyPriceChanges should not be called in comment tests");
  }
  async listSkus(_req: never, _headers: Headers): Promise<never> {
    throw new Error("listSkus should not be called in comment tests");
  }
  async batchGetPrices(_req: never, _headers: Headers): Promise<never> {
    throw new Error("batchGetPrices should not be called in comment tests");
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () => Promise.reject(new Error("validateBatch should not be called in comment tests"));
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
      name: "AddComment",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("Proposal Comments", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const USER_1 = "00000000-0000-0000-0000-000000000011";
  const USER_2 = "00000000-0000-0000-0000-000000000022";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_comments_test")
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

  async function createProposal(orgId: string, userId: string): Promise<string> {
    const req = create(CreateProposalRequestSchema, { title: "Comment Test Proposal" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, userId, req)
    );
    return created.row.id;
  }

  it("adds a comment to a proposal and returns it with correct fields", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    const response = await impl(
      { proposalId, body: "Looks good to me." } as never,
      makeContext(ORG_A, USER_2)
    ) as unknown as AddCommentResponse;

    expect(response.comment).toBeDefined();
    expect(response.comment!.proposalId).toBe(proposalId);
    expect(response.comment!.authorId).toBe(USER_2);
    expect(response.comment!.body).toBe("Looks good to me.");
    expect(response.comment!.orgId).toBe(ORG_A);

    const { rows } = await superuser.query(
      `SELECT * FROM proposal.proposal_comment WHERE proposal_id = $1`,
      [proposalId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.author_id).toBe(USER_2);
    expect(rows[0]!.body).toBe("Looks good to me.");
    expect(rows[0]!.org_id).toBe(ORG_A);
  });

  it("lists comments in reverse-chronological order", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    await impl({ proposalId, body: "First comment." } as never, makeContext(ORG_A, USER_1));
    // Small delay to ensure distinct occurred_at values
    await new Promise((r) => setTimeout(r, 10));
    await impl({ proposalId, body: "Second comment." } as never, makeContext(ORG_A, USER_2));

    const listImpl = service.implementation.listComments!;
    const response = await listImpl(
      { proposalId, pagination: { pageSize: 10, pageToken: "" } } as never,
      makeContext(ORG_A, USER_1)
    ) as unknown as ListCommentsResponse;

    expect(response.comments).toHaveLength(2);
    expect(response.comments[0]!.body).toBe("Second comment.");
    expect(response.comments[1]!.body).toBe("First comment.");
  });

  it("rejects an empty body with InvalidArgument", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    await expect(
      impl({ proposalId, body: "" } as never, makeContext(ORG_A, USER_2))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.InvalidArgument
    );
  });

  it("rejects a whitespace-only body with InvalidArgument", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    await expect(
      impl({ proposalId, body: "   " } as never, makeContext(ORG_A, USER_2))
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError && err.code === Code.InvalidArgument
    );
  });

  it("returns NotFound when proposal does not exist", async () => {
    const impl = service.implementation.addComment!;
    await expect(
      impl(
        { proposalId: "00000000-0000-0000-0000-000000009999", body: "hi" } as never,
        makeContext(ORG_A, USER_1)
      )
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("returns NotFound when proposal belongs to a different org (RLS isolation)", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    await expect(
      impl({ proposalId, body: "Cross-org attempt." } as never, makeContext(ORG_B, USER_2))
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
    );
  });

  it("paginates comments: first page returns page_size items, second page returns remainder", async () => {
    const proposalId = await createProposal(ORG_A, USER_1);

    const impl = service.implementation.addComment!;
    for (let i = 1; i <= 3; i++) {
      await impl(
        { proposalId, body: `Comment ${i}` } as never,
        makeContext(ORG_A, USER_1)
      );
      await new Promise((r) => setTimeout(r, 10));
    }

    const listImpl = service.implementation.listComments!;

    const page1 = await listImpl(
      { proposalId, pagination: { pageSize: 2, pageToken: "" } } as never,
      makeContext(ORG_A, USER_1)
    ) as unknown as ListCommentsResponse;
    expect(page1.comments).toHaveLength(2);
    expect(page1.pagination!.nextPageToken).not.toBe("");

    const page2 = await listImpl(
      {
        proposalId,
        pagination: { pageSize: 2, pageToken: page1.pagination!.nextPageToken },
      } as never,
      makeContext(ORG_A, USER_1)
    ) as unknown as ListCommentsResponse;
    expect(page2.comments).toHaveLength(1);
    expect(page2.pagination!.nextPageToken).toBe("");
  });
});
