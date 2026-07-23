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
  PreviewChangeSetRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  type ListSkusRequest,
  type ListSkusResponse,
  ListSkusResponseSchema,
  type BatchGetPricesRequest,
  type BatchGetPricesResponse,
  BatchGetPricesResponseSchema,
  SkuSchema,
  PriceRecordSchema,
  type ApplyPriceChangesRequest,
  type ApplyPriceChangesResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
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

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in preview-change-set tests"));
}

class StubCatalogClient implements CatalogClient {
  constructor(
    private readonly skus: ReturnType<typeof create<typeof SkuSchema>>[],
    private readonly prices: ReturnType<typeof create<typeof PriceRecordSchema>>[],
  ) {}

  async listSkus(_req: ListSkusRequest, _headers: Headers): Promise<ListSkusResponse> {
    return create(ListSkusResponseSchema, { skus: this.skus });
  }
  async batchGetPrices(_req: BatchGetPricesRequest, _headers: Headers): Promise<BatchGetPricesResponse> {
    return create(BatchGetPricesResponseSchema, { prices: this.prices });
  }
  async applyPriceChanges(_req: ApplyPriceChangesRequest, _headers: Headers): Promise<ApplyPriceChangesResponse> {
    throw new Error("applyPriceChanges should not be called in preview-change-set tests");
  }
}

const CHANNEL_ID = "00000000-0000-0000-0000-000000000001";
const SKU_ID_1   = "00000000-0000-0000-0000-000000000011";
const SKU_ID_2   = "00000000-0000-0000-0000-000000000012";
const SKU_ID_3   = "00000000-0000-0000-0000-000000000013";
const ORG_ID     = "00000000-0000-0000-0000-000000000099";
const USER_ID    = "00000000-0000-0000-0000-000000000001";

const VALID_SCOPE = JSON.stringify({ channel_id: CHANNEL_ID });
const PCT_UP_5    = JSON.stringify({ type: "pct_increase", value: 5 });
const PCT_DOWN_100 = JSON.stringify({ type: "pct_decrease", value: 100 });

function money(amount: bigint, currency = "NGN") {
  return create(MoneySchema, { amount, currency });
}

function makeSku(id: string) {
  return create(SkuSchema, { id, skuCode: `SKU-${id.slice(-4)}` });
}

function makePriceRecord(skuId: string, amount: bigint) {
  return create(PriceRecordSchema, {
    skuId,
    channelId: CHANNEL_ID,
    price: money(amount),
  });
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
      name: "PreviewChangeSet",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("PreviewChangeSet", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_preview_change_set_test")
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

  it("happy path — 3 SKUs with pct_increase 5% produces draft change-set with 3 lines", async () => {
    const skus   = [makeSku(SKU_ID_1), makeSku(SKU_ID_2), makeSku(SKU_ID_3)];
    const prices = [
      makePriceRecord(SKU_ID_1, 100000n),
      makePriceRecord(SKU_ID_2, 200000n),
      makePriceRecord(SKU_ID_3, 300000n),
    ];
    const service = makeService(new StubCatalogClient(skus, prices));
    const impl = service.implementation.previewChangeSet!;

    const resp = await impl(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      makeContext(ORG_ID, USER_ID),
    ) as { changeSet: { id: string; status: number; lines: Array<{ proposedPrice: { amount: bigint }; currentPrice: { amount: bigint }; diffPct: number; diffAbsolute: { amount: bigint } }> } };

    const cs = resp.changeSet;
    expect(cs.status).toBe(1); // DRAFT = 1
    expect(cs.lines).toHaveLength(3);

    for (const line of cs.lines) {
      expect(line.proposedPrice.amount > line.currentPrice.amount).toBe(true);
      expect(line.diffPct).toBeGreaterThan(0);
      expect(line.diffAbsolute.amount > 0n).toBe(true);
    }

    // Verify persisted — fetch via repo
    const persisted = await db.withOrgTransaction(ORG_ID, (c) => repo.getChangeSet(c, cs.id));
    expect(persisted).not.toBeNull();
    expect(persisted!.lines).toHaveLength(3);
  });

  it("empty Catalog result — persists change-set with no lines", async () => {
    const service = makeService(new StubCatalogClient([], []));
    const impl = service.implementation.previewChangeSet!;

    const resp = await impl(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      makeContext(ORG_ID, USER_ID),
    ) as { changeSet: { id: string; lines: unknown[] } };

    expect(resp.changeSet.lines).toHaveLength(0);

    const persisted = await db.withOrgTransaction(ORG_ID, (c) => repo.getChangeSet(c, resp.changeSet.id));
    expect(persisted).not.toBeNull();
    expect(persisted!.lines).toHaveLength(0);
  });

  it("silently drops unpriced SKU — 2 SKUs, 1 price → 1 line", async () => {
    const skus   = [makeSku(SKU_ID_1), makeSku(SKU_ID_2)];
    const prices = [makePriceRecord(SKU_ID_1, 100000n)];
    const service = makeService(new StubCatalogClient(skus, prices));
    const impl = service.implementation.previewChangeSet!;

    const resp = await impl(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      makeContext(ORG_ID, USER_ID),
    ) as { changeSet: { lines: Array<{ skuId: string }> } };

    expect(resp.changeSet.lines).toHaveLength(1);
    expect(resp.changeSet.lines[0]!.skuId).toBe(SKU_ID_1);
  });

  it("rejects invalid rule_json — non-JSON", async () => {
    const service = makeService(new StubCatalogClient([], []));
    const impl = service.implementation.previewChangeSet!;

    await expect(
      impl(
        create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: "not-json" }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
    );
  });

  it("rejects invalid rule_json — unknown type", async () => {
    const service = makeService(new StubCatalogClient([], []));
    const impl = service.implementation.previewChangeSet!;

    await expect(
      impl(
        create(PreviewChangeSetRequestSchema, {
          scopeJson: VALID_SCOPE,
          ruleJson: JSON.stringify({ type: "fixed", value: 500 }),
        }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
    );
  });

  it("rejects invalid scope_json before parsing rule", async () => {
    const service = makeService(new StubCatalogClient([], []));
    const impl = service.implementation.previewChangeSet!;

    await expect(
      impl(
        create(PreviewChangeSetRequestSchema, { scopeJson: "bad-scope", ruleJson: PCT_UP_5 }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
    );
  });

  it("rule produces non-positive price — throws FailedPrecondition and writes no DB rows", async () => {
    const countBefore = Number(
      (await superuser.query("SELECT COUNT(*) FROM proposal.change_set")).rows[0].count
    );

    const skus   = [makeSku(SKU_ID_1)];
    const prices = [makePriceRecord(SKU_ID_1, 100000n)];
    const service = makeService(new StubCatalogClient(skus, prices));
    const impl = service.implementation.previewChangeSet!;

    await expect(
      impl(
        create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_DOWN_100 }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition,
    );

    const countAfter = Number(
      (await superuser.query("SELECT COUNT(*) FROM proposal.change_set")).rows[0].count
    );
    expect(countAfter).toBe(countBefore);
  });
});
