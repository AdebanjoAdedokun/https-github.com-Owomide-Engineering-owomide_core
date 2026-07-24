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
  SubmitChangeSetRequestSchema,
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
    Promise.reject(new Error("validateBatch should not be called in submit-change-set tests"));
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
    throw new Error("applyPriceChanges should not be called in submit-change-set tests");
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
      name: "SubmitChangeSet",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

describe("SubmitChangeSet", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_submit_change_set_test")
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

  it("happy path — preview 3 SKUs then submit wraps into a draft Proposal with matching lines", async () => {
    const skus = [makeSku(SKU_ID_1), makeSku(SKU_ID_2), makeSku(SKU_ID_3)];
    const prices = [
      makePriceRecord(SKU_ID_1, 100000n),
      makePriceRecord(SKU_ID_2, 200000n),
      makePriceRecord(SKU_ID_3, 300000n),
    ];
    const service = makeService(new StubCatalogClient(skus, prices));
    const ctx = makeContext(ORG_ID, USER_ID);

    // Create the draft change-set via PreviewChangeSet
    const previewResp = await service.implementation.previewChangeSet!(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      ctx,
    ) as { changeSet: { id: string } };
    const changeSetId = previewResp.changeSet.id;

    // Submit it
    const resp = await service.implementation.submitChangeSet!(
      create(SubmitChangeSetRequestSchema, { id: changeSetId, title: "Q3 repricing" }) as never,
      ctx,
    ) as {
      proposal: {
        id: string;
        state: number;
        changeSetId: string;
        lines: Array<{ proposedPrice: { amount: bigint }; currentPrice: { amount: bigint } }>;
      };
    };

    const proposal = resp.proposal;
    expect(proposal.state).toBe(1); // DRAFT = 1
    expect(proposal.changeSetId).toBe(changeSetId);
    expect(proposal.lines).toHaveLength(3);
    for (const line of proposal.lines) {
      expect(line.proposedPrice.amount > line.currentPrice.amount).toBe(true);
    }

    // Change-set row should be stamped submitted with back-reference to the new proposal
    const csRow = (
      await superuser.query<{ status: string; proposal_id: string | null; submitted_at: Date | null }>(
        "SELECT status, proposal_id, submitted_at FROM proposal.change_set WHERE id = $1",
        [changeSetId],
      )
    ).rows[0]!;

    expect(csRow.status).toBe("submitted");
    expect(csRow.proposal_id).toBe(proposal.id);
    expect(csRow.submitted_at).not.toBeNull();
  });

  it("submit non-existent change-set returns FailedPrecondition", async () => {
    const service = makeService(new StubCatalogClient([], []));

    await expect(
      service.implementation.submitChangeSet!(
        create(SubmitChangeSetRequestSchema, {
          id: "00000000-0000-0000-0000-000000000000",
          title: "ghost",
        }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition,
    );
  });

  it("double-submit (already submitted change-set) returns FailedPrecondition", async () => {
    const skus = [makeSku(SKU_ID_1)];
    const prices = [makePriceRecord(SKU_ID_1, 100000n)];
    const service = makeService(new StubCatalogClient(skus, prices));
    const ctx = makeContext(ORG_ID, USER_ID);

    const previewResp = await service.implementation.previewChangeSet!(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      ctx,
    ) as { changeSet: { id: string } };
    const changeSetId = previewResp.changeSet.id;

    // First submit succeeds
    await service.implementation.submitChangeSet!(
      create(SubmitChangeSetRequestSchema, { id: changeSetId, title: "First submit" }) as never,
      ctx,
    );

    // Second submit must fail — change-set is no longer draft
    await expect(
      service.implementation.submitChangeSet!(
        create(SubmitChangeSetRequestSchema, { id: changeSetId, title: "Second submit" }) as never,
        ctx,
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.FailedPrecondition,
    );
  });

  it("empty title returns InvalidArgument", async () => {
    const service = makeService(new StubCatalogClient([], []));

    await expect(
      service.implementation.submitChangeSet!(
        create(SubmitChangeSetRequestSchema, {
          id: "00000000-0000-0000-0000-000000000000",
          title: "   ",
        }) as never,
        makeContext(ORG_ID, USER_ID),
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
    );
  });

  it("empty change-set (0 lines) — submit produces proposal with no lines", async () => {
    const service = makeService(new StubCatalogClient([], []));
    const ctx = makeContext(ORG_ID, USER_ID);

    const previewResp = await service.implementation.previewChangeSet!(
      create(PreviewChangeSetRequestSchema, { scopeJson: VALID_SCOPE, ruleJson: PCT_UP_5 }) as never,
      ctx,
    ) as { changeSet: { id: string } };
    const changeSetId = previewResp.changeSet.id;

    const resp = await service.implementation.submitChangeSet!(
      create(SubmitChangeSetRequestSchema, { id: changeSetId, title: "Empty batch" }) as never,
      ctx,
    ) as { proposal: { id: string; changeSetId: string; lines: unknown[] } };

    expect(resp.proposal.lines).toHaveLength(0);
    expect(resp.proposal.changeSetId).toBe(changeSetId);

    const csRow = (
      await superuser.query<{ status: string }>(
        "SELECT status FROM proposal.change_set WHERE id = $1",
        [changeSetId],
      )
    ).rows[0]!;
    expect(csRow.status).toBe("submitted");
  });
});
