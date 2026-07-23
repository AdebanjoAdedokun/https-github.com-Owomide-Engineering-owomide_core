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
  GetChangeSetRequestSchema,
  ListChangeSetsRequestSchema,
  UpdateChangeSetRequestSchema,
  DiscardChangeSetRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
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
    throw new Error("applyPriceChanges should not be called in change-set-crud tests");
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in change-set-crud tests"));
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
      name: "GetChangeSet",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("ChangeSet CRUD", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;
  let service: ProposalServiceImpl;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const ACTOR_A = "00000000-0000-0000-0000-000000000011";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_change_set_crud_test")
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

  async function seedChangeSet(orgId: string, actorId: string, scopeJson = "{}", ruleJson = "{}") {
    return db.withOrgTransaction(orgId, (c) =>
      repo.createChangeSet(c, orgId, actorId, scopeJson, ruleJson)
    );
  }

  describe("GetChangeSet", () => {
    it("returns the change-set by id", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.getChangeSet!;
      const resp = await impl(
        create(GetChangeSetRequestSchema, { id: row.id }),
        makeContext(ORG_A, ACTOR_A)
      ) as { changeSet?: { id: string; status: number } };
      expect(resp.changeSet?.id).toBe(row.id);
      expect(resp.changeSet?.status).toBe(1); // ChangeSetStatus.DRAFT
    });

    it("returns NotFound for unknown UUID", async () => {
      const impl = service.implementation.getChangeSet!;
      await expect(
        impl(
          create(GetChangeSetRequestSchema, { id: "00000000-0000-0000-0000-999999999999" }),
          makeContext(ORG_A, ACTOR_A)
        )
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
      );
    });

    it("returns NotFound for ORG_A change-set when queried from ORG_B (RLS isolation)", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.getChangeSet!;
      await expect(
        impl(
          create(GetChangeSetRequestSchema, { id: row.id }),
          makeContext(ORG_B, ACTOR_A)
        )
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.NotFound
      );
    });
  });

  describe("ListChangeSets", () => {
    it("returns draft change-sets for the org", async () => {
      // Seed two drafts for ORG_A
      await seedChangeSet(ORG_A, ACTOR_A);
      await seedChangeSet(ORG_A, ACTOR_A);

      const impl = service.implementation.listChangeSets!;
      const resp = await impl(
        create(ListChangeSetsRequestSchema, {}),
        makeContext(ORG_A, ACTOR_A)
      ) as { changeSets: { id: string }[] };
      expect(resp.changeSets.length).toBeGreaterThanOrEqual(2);
    });

    it("does not return change-sets from another org (RLS isolation)", async () => {
      await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.listChangeSets!;
      const resp = await impl(
        create(ListChangeSetsRequestSchema, {}),
        makeContext(ORG_B, ACTOR_A)
      ) as { changeSets: { id: string }[] };
      // ORG_B has no change-sets
      expect(resp.changeSets).toHaveLength(0);
    });

    it("does not include discarded change-sets", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      await superuser.query(
        `UPDATE proposal.change_set SET status = 'discarded' WHERE id = $1`,
        [row.id]
      );
      const impl = service.implementation.listChangeSets!;
      const resp = await impl(
        create(ListChangeSetsRequestSchema, {}),
        makeContext(ORG_A, ACTOR_A)
      ) as { changeSets: { id: string }[] };
      const ids = resp.changeSets.map((cs) => cs.id);
      expect(ids).not.toContain(row.id);
    });
  });

  describe("UpdateChangeSet", () => {
    it("updates scope and rule on a draft change-set", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.updateChangeSet!;
      const resp = await impl(
        create(UpdateChangeSetRequestSchema, {
          id: row.id,
          scopeJson: '{"channel":"wholesale"}',
          ruleJson: '{"type":"pct_increase","value":5}',
        }),
        makeContext(ORG_A, ACTOR_A)
      ) as { changeSet?: { id: string; scopeJson: string; ruleJson: string } };

      expect(resp.changeSet?.id).toBe(row.id);
      expect(resp.changeSet?.scopeJson).toBe('{"channel":"wholesale"}');
      expect(resp.changeSet?.ruleJson).toBe('{"type":"pct_increase","value":5}');

      const { rows } = await superuser.query(
        `SELECT scope, rule FROM proposal.change_set WHERE id = $1`,
        [row.id]
      );
      expect(rows[0]!.scope).toEqual({ channel: "wholesale" });
      expect(rows[0]!.rule).toEqual({ type: "pct_increase", value: 5 });
    });

    it("returns FailedPrecondition when change-set is not in draft state", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      await superuser.query(
        `UPDATE proposal.change_set SET status = 'discarded' WHERE id = $1`,
        [row.id]
      );
      const impl = service.implementation.updateChangeSet!;
      await expect(
        impl(
          create(UpdateChangeSetRequestSchema, {
            id: row.id,
            scopeJson: "{}",
            ruleJson: "{}",
          }),
          makeContext(ORG_A, ACTOR_A)
        )
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
      );
    });
  });

  describe("DiscardChangeSet", () => {
    it("sets status to discarded", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.discardChangeSet!;
      await impl(
        create(DiscardChangeSetRequestSchema, { id: row.id }),
        makeContext(ORG_A, ACTOR_A)
      );
      const { rows } = await superuser.query(
        `SELECT status FROM proposal.change_set WHERE id = $1`,
        [row.id]
      );
      expect(rows[0]!.status).toBe("discarded");
    });

    it("returns FailedPrecondition when already discarded", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      await superuser.query(
        `UPDATE proposal.change_set SET status = 'discarded' WHERE id = $1`,
        [row.id]
      );
      const impl = service.implementation.discardChangeSet!;
      await expect(
        impl(
          create(DiscardChangeSetRequestSchema, { id: row.id }),
          makeContext(ORG_A, ACTOR_A)
        )
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
      );
    });

    it("returns FailedPrecondition for ORG_B attempting to discard ORG_A's change-set (RLS isolation)", async () => {
      const row = await seedChangeSet(ORG_A, ACTOR_A);
      const impl = service.implementation.discardChangeSet!;
      await expect(
        impl(
          create(DiscardChangeSetRequestSchema, { id: row.id }),
          makeContext(ORG_B, ACTOR_A)
        )
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition
      );
    });
  });
});
