import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import {
  Code,
  createClient,
  createRouterTransport,
  ConnectError,
  type CallOptions,
  type ConnectRouter,
} from "@connectrpc/connect";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  CatalogErrorCode,
  CatalogService,
  SourceType,
  WriteStatus,
  ApplyPriceChangesRequestSchema,
  BatchGetCostsRequestSchema,
  BatchGetPricesRequestSchema,
  GetSkuRequestSchema,
  SaveChannelRequestSchema,
  UpsertCanonicalRequestSchema,
  type ApplyPriceChangesResponse,
  type BatchGetCostsResponse,
  type BatchGetPricesResponse,
  type GetSkuResponse,
  type SaveChannelResponse,
  type UpsertCanonicalResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { Database } from "../../db.js";
import { dateToTimestamp } from "../../domain/time.js";
import { ServiceAuthenticator } from "../../context.js";
import { CatalogServiceImpl } from "../../service.js";
import { OutboxWorker } from "../../outbox.js";

const gatewaySecret = "gateway-integration-secret-that-is-at-least-32-chars";
const pipelineSecret = "pipeline-integration-secret-that-is-at-least-32-chars";
const proposalSecret = "proposal-integration-secret-that-is-at-least-32-chars";
const orgA = "org-integration-a";
const CATALOG_MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_catalog_foundation.up.sql",
  "0003_tax_basis_cost_unit_resolution.up.sql",
];
const orgB = "org-integration-b";

type UnaryClient<I extends DescMessage, O> = (
  request: MessageInitShape<I>,
  options?: CallOptions
) => Promise<O>;

interface CatalogTestClient {
  applyPriceChanges: UnaryClient<typeof ApplyPriceChangesRequestSchema, ApplyPriceChangesResponse>;
  batchGetCosts: UnaryClient<typeof BatchGetCostsRequestSchema, BatchGetCostsResponse>;
  batchGetPrices: UnaryClient<typeof BatchGetPricesRequestSchema, BatchGetPricesResponse>;
  getSku: UnaryClient<typeof GetSkuRequestSchema, GetSkuResponse>;
  saveChannel: UnaryClient<typeof SaveChannelRequestSchema, SaveChannelResponse>;
  upsertCanonical: UnaryClient<typeof UpsertCanonicalRequestSchema, UpsertCanonicalResponse>;
}

async function serviceToken(service: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("owomide-internal")
    .setSubject(service)
    .setAudience("catalog")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

describe("Catalog service integration", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let database: Database;
  let client: CatalogTestClient;
  let gatewayToken: string;
  let pipelineToken: string;
  let proposalToken: string;
  let channelId: string;
  let skuId: string;

  const headers = (token: string, orgId = orgA, adminRole = false) =>
    new Headers({
      authorization: `Bearer ${token}`,
      "x-org-id": orgId,
      "x-user-id": "user-integration",
      "x-user-roles": adminRole ? "admin" : "analyst",
    });

  beforeAll(async () => {
    // CATALOG_TEST_DATABASE_URL (a superuser URL for an empty database) replaces the container
    // where Docker is unavailable.
    let adminUrl = process.env.CATALOG_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("owomide_catalog_test")
        .start();
      adminUrl = container.getConnectionUri();
    }
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      "DO $$ BEGIN CREATE ROLE catalog_svc LOGIN PASSWORD 'catalog_test'; " +
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    );
    await admin.query("CREATE SCHEMA catalog");
    await admin.query("GRANT USAGE ON SCHEMA catalog TO catalog_svc");
    for (const filename of CATALOG_MIGRATIONS) {
      const up = readFileSync(resolve(process.cwd(), "migrations", filename), "utf8");
      await admin.query(up);
    }

    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = "catalog_svc";
    runtimeUrl.password = "catalog_test";
    database = new Database({
      databaseUrl: runtimeUrl.toString(),
      databasePoolSize: 10,
      databaseStatementTimeoutMs: 20_000,
    });
    const authenticator = new ServiceAuthenticator("owomide-internal", {
      gateway_svc: gatewaySecret,
      data_pipeline_svc: pipelineSecret,
      proposal_svc: proposalSecret,
    });
    const service = new CatalogServiceImpl(database, authenticator);
    const transport = createRouterTransport((router: ConnectRouter) =>
      router.service(CatalogService, service.implementation)
    );
    client = createClient(CatalogService, transport) as unknown as CatalogTestClient;
    [gatewayToken, pipelineToken, proposalToken] = await Promise.all([
      serviceToken("gateway_svc", gatewaySecret),
      serviceToken("data_pipeline_svc", pipelineSecret),
      serviceToken("proposal_svc", proposalSecret),
    ]);
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    for (const filename of [...CATALOG_MIGRATIONS].reverse()) {
      const down = readFileSync(
        resolve(process.cwd(), "migrations", filename.replace(".up.sql", ".down.sql")),
        "utf8"
      );
      await admin?.query(down);
    }
    const extension = await admin?.query(
      "SELECT extname FROM pg_extension WHERE extname = 'btree_gist'"
    );
    expect(extension?.rowCount).toBe(1);
    await admin?.end();
    await container?.stop();
  }, 120_000);

  it("authenticates reference administration and creates controlled dimensions", async () => {
    const saved = await client.saveChannel(
      {
        code: "Retail",
        name: "Retail",
        defaultCurrency: "ngn",
        attributesJson: '{"kind":"consumer"}',
      },
      { headers: headers(gatewayToken, orgA, true) }
    );
    channelId = saved.channel!.id;
    expect(saved.channel?.defaultCurrency).toBe("NGN");

    await expect(
      client.saveChannel(
        {
          code: "Wholesale",
          name: "Wholesale",
          defaultCurrency: "NGN",
        },
        { headers: headers(gatewayToken, orgA, false) }
      )
    ).rejects.toBeInstanceOf(ConnectError);

    await expect(
      client.upsertCanonical(
        {
          idempotencyKey: "invalid-provenance",
          source: { sourceType: SourceType.PROPOSAL, sourceRef: "proposal-spoof" },
          rows: [
            {
              sourceItemRef: "row-1",
              skuIdentity: { key: { case: "skuCode", value: "SKU-SPOOF" } },
              newSku: { skuCode: "SKU-SPOOF" },
            },
          ],
        },
        { headers: headers(pipelineToken) }
      )
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it("commits a new SKU and price and replays retries without duplicate records", async () => {
    const request = {
      idempotencyKey: "batch-1:chunk-0",
      source: { sourceType: SourceType.IMPORT, sourceRef: "batch-1", actorId: "user-integration" },
      rows: [
        {
          sourceItemRef: "row-1",
          skuIdentity: { key: { case: "skuCode" as const, value: "SKU-001" } },
          newSku: { skuCode: "SKU-001", attributesJson: '{"brand":"Acme"}' },
          prices: [
            {
              channelId,
              price: create(MoneySchema, { amount: 10_000n, currency: "NGN" }),
              effectiveAt: dateToTimestamp(new Date("2026-01-01T00:00:00Z")),
            },
          ],
        },
      ],
    };
    const first = await client.upsertCanonical(request, { headers: headers(pipelineToken) });
    skuId = first.results[0]!.skuId!;
    expect(first.summary).toMatchObject({ created: 1, rejected: 0 });
    const replay = await client.upsertCanonical(request, { headers: headers(pipelineToken) });
    expect(replay.replayed).toBe(true);
    expect(replay.operationId).toBe(first.operationId);
    const counts = await database.withOrgTransaction(orgA, async (db) => {
      const result = await db.query<{ prices: string; operations: string }>(
        `SELECT (SELECT count(*) FROM catalog.price_record)::text AS prices,
                (SELECT count(*) FROM catalog.write_operation)::text AS operations`
      );
      return result.rows[0]!;
    });
    expect(counts).toEqual({ prices: "1", operations: "1" });

    await expect(
      client.upsertCanonical(
        {
          ...request,
          rows: [
            {
              ...request.rows[0]!,
              prices: [
                {
                  ...request.rows[0]!.prices[0]!,
                  price: create(MoneySchema, { amount: 10_001n, currency: "NGN" }),
                },
              ],
            },
          ],
        },
        { headers: headers(pipelineToken) }
      )
    ).rejects.toMatchObject({ code: Code.AlreadyExists });
  });

  it("preserves current and recorded-as-of truth when a future price is inserted", async () => {
    const firstRecorded = await database.withOrgTransaction(orgA, async (db) => {
      const result = await db.query<{ recorded_at: Date }>(
        "SELECT recorded_at FROM catalog.price_record WHERE superseded_at IS NULL"
      );
      return result.rows[0]!.recorded_at;
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    const changed = await client.upsertCanonical(
      {
        idempotencyKey: "batch-2:chunk-0",
        source: { sourceType: SourceType.IMPORT, sourceRef: "batch-2" },
        rows: [
          {
            sourceItemRef: "row-1",
            skuIdentity: { key: { case: "skuId", value: skuId } },
            prices: [
              {
                channelId,
                price: create(MoneySchema, { amount: 12_000n, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date("2026-03-01T00:00:00Z")),
              },
            ],
          },
        ],
      },
      { headers: headers(pipelineToken) }
    );
    expect(changed.results[0]?.status).toBe(WriteStatus.UPDATED);

    const currentFebruary = await client.batchGetPrices(
      {
        skuIds: [skuId],
        channelId,
        effectiveAsOf: dateToTimestamp(new Date("2026-02-01T00:00:00Z")),
        recordedAsOf: dateToTimestamp(new Date()),
      },
      { headers: headers(pipelineToken) }
    );
    expect(currentFebruary.prices[0]?.price?.amount).toBe(10_000n);

    const currentApril = await client.batchGetPrices(
      {
        skuIds: [skuId],
        channelId,
        effectiveAsOf: dateToTimestamp(new Date("2026-04-01T00:00:00Z")),
        recordedAsOf: dateToTimestamp(new Date()),
      },
      { headers: headers(pipelineToken) }
    );
    expect(currentApril.prices[0]?.price?.amount).toBe(12_000n);

    const formerlyKnownApril = await client.batchGetPrices(
      {
        skuIds: [skuId],
        channelId,
        effectiveAsOf: dateToTimestamp(new Date("2026-04-01T00:00:00Z")),
        recordedAsOf: dateToTimestamp(new Date(firstRecorded.getTime() + 1)),
      },
      { headers: headers(pipelineToken) }
    );
    expect(formerlyKnownApril.prices[0]?.price?.amount).toBe(10_000n);
  });

  it("splits bounded backdated periods and writes cost through the same history rules", async () => {
    const response = await client.upsertCanonical(
      {
        idempotencyKey: "batch-backdated:chunk-0",
        source: { sourceType: SourceType.IMPORT, sourceRef: "batch-backdated" },
        rows: [
          {
            sourceItemRef: "row-backdated",
            skuIdentity: { key: { case: "skuId", value: skuId } },
            cost: {
              costType: "standard",
              cost: create(MoneySchema, { amount: 6_000n, currency: "NGN" }),
              effectiveAt: dateToTimestamp(new Date("2026-01-01T00:00:00Z")),
            },
            prices: [
              {
                channelId,
                price: create(MoneySchema, { amount: 9_000n, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date("2026-02-01T00:00:00Z")),
                effectiveUntil: dateToTimestamp(new Date("2026-02-15T00:00:00Z")),
              },
            ],
          },
        ],
      },
      { headers: headers(pipelineToken) }
    );
    expect(response.results[0]?.status).toBe(WriteStatus.CREATED);
    expect(response.results[0]?.costRecordIds).toHaveLength(1);

    const priceAt = async (at: string) => {
      const result = await client.batchGetPrices(
        {
          skuIds: [skuId],
          channelId,
          effectiveAsOf: dateToTimestamp(new Date(at)),
          recordedAsOf: dateToTimestamp(new Date()),
        },
        { headers: headers(pipelineToken) }
      );
      return result.prices[0]?.price?.amount;
    };
    expect(await priceAt("2026-01-15T00:00:00Z")).toBe(10_000n);
    expect(await priceAt("2026-02-07T00:00:00Z")).toBe(9_000n);
    expect(await priceAt("2026-02-20T00:00:00Z")).toBe(10_000n);
    expect(await priceAt("2026-04-01T00:00:00Z")).toBe(12_000n);

    const costs = await client.batchGetCosts(
      {
        skuIds: [skuId],
        costType: "standard",
        effectiveAsOf: dateToTimestamp(new Date("2026-02-01T00:00:00Z")),
        recordedAsOf: dateToTimestamp(new Date()),
      },
      { headers: headers(pipelineToken) }
    );
    expect(costs.costs[0]?.cost?.amount).toBe(6_000n);
  });

  it("keeps successful rows when another source row is rejected", async () => {
    const unknownChannel = "fe8b8ed5-0b43-4d99-83af-a61bbb30fac7";
    const result = await client.upsertCanonical(
      {
        idempotencyKey: "batch-3:chunk-0",
        source: { sourceType: SourceType.IMPORT, sourceRef: "batch-3" },
        rows: [
          {
            sourceItemRef: "row-good",
            skuIdentity: { key: { case: "skuCode", value: "SKU-002" } },
            newSku: { skuCode: "SKU-002" },
            prices: [
              {
                channelId,
                price: create(MoneySchema, { amount: 7_500n, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date("2026-01-01T00:00:00Z")),
              },
            ],
          },
          {
            sourceItemRef: "row-bad",
            skuIdentity: { key: { case: "skuCode", value: "SKU-003" } },
            newSku: { skuCode: "SKU-003" },
            prices: [
              {
                channelId: unknownChannel,
                price: create(MoneySchema, { amount: 8_000n, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date("2026-01-01T00:00:00Z")),
              },
            ],
          },
        ],
      },
      { headers: headers(pipelineToken) }
    );
    expect(result.summary).toMatchObject({ created: 1, rejected: 1 });
    expect(result.results[1]?.errors[0]?.code).toBe(CatalogErrorCode.UNKNOWN_CHANNEL);
    const count = await database.withOrgTransaction(orgA, async (db) => {
      const rows = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM catalog.sku"
      );
      return rows.rows[0]!.count;
    });
    expect(count).toBe("2");
  });

  it("isolates tenants without revealing cross-org identifiers", async () => {
    await expect(
      client.getSku({ id: skuId }, { headers: headers(gatewayToken, orgB) })
    ).rejects.toMatchObject({ code: 5 });
    const otherChannel = await client.saveChannel(
      {
        code: "Retail",
        name: "Other Retail",
        defaultCurrency: "NGN",
      },
      { headers: headers(gatewayToken, orgB, true) }
    );
    expect(otherChannel.channel?.id).not.toBe(channelId);
  });

  it("serializes concurrent writes to the same price key without overlap", async () => {
    const write = (key: string, amount: bigint) =>
      client.upsertCanonical(
        {
          idempotencyKey: key,
          source: { sourceType: SourceType.IMPORT, sourceRef: key },
          rows: [
            {
              sourceItemRef: "row-concurrent",
              skuIdentity: { key: { case: "skuId", value: skuId } },
              prices: [
                {
                  channelId,
                  price: create(MoneySchema, { amount, currency: "NGN" }),
                  effectiveAt: dateToTimestamp(new Date("2026-05-01T00:00:00Z")),
                },
              ],
            },
          ],
        },
        { headers: headers(pipelineToken) }
      );
    const results = await Promise.all([
      write("concurrent-a", 13_000n),
      write("concurrent-b", 14_000n),
    ]);
    expect(results.every((result: UpsertCanonicalResponse) => result.summary?.rejected === 0)).toBe(
      true
    );
    const overlaps = await database.withOrgTransaction(orgA, async (db) => {
      const result = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM catalog.price_record
         WHERE sku_id = $1 AND channel_id = $2 AND superseded_at IS NULL
           AND effective_period @> '2026-06-01T00:00:00Z'::timestamptz`,
        [skuId, channelId]
      );
      return result.rows[0]!.count;
    });
    expect(overlaps).toBe("1");
  });

  it("applies proposal prices through the same idempotent temporal engine", async () => {
    const response = await client.applyPriceChanges(
      {
        idempotencyKey: "proposal-1:publish",
        proposalId: "proposal-1",
        actorId: "approver-1",
        changes: [
          {
            proposalLineId: "line-1",
            skuId,
            channelId,
            newPrice: create(MoneySchema, { amount: 15_000n, currency: "NGN" }),
            effectiveAt: dateToTimestamp(new Date("2026-07-01T00:00:00Z")),
          },
        ],
      },
      { headers: headers(proposalToken) }
    );
    expect(response.summary?.rejected).toBe(0);
    expect(response.results[0]?.priceRecordIds).toHaveLength(1);
  });

  it("leases and publishes transactional outbox events exactly once logically", async () => {
    const published: string[] = [];
    const worker = new OutboxWorker(
      database,
      {
        async publish(_topic, event) {
          published.push(event.id);
        },
        async close() {},
      },
      500
    );
    const count = await worker.runOnce();
    expect(count).toBeGreaterThan(0);
    expect(new Set(published).size).toBe(published.length);
    expect(await worker.runOnce()).toBe(0);
    const pending = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM catalog.outbox_event WHERE published_at IS NULL"
    );
    expect(pending.rows[0]?.count).toBe("0");
  });

  it("loads deterministic demo fixtures with realistic query volume", async () => {
    const fixture = readFileSync(resolve(process.cwd(), "fixtures/demo.sql"), "utf8");
    await admin.query(fixture);
    const counts = await admin.query<{ skus: string; prices: string; costs: string }>(
      `SELECT
         (SELECT count(*) FROM catalog.sku WHERE org_id = 'org-demo')::text AS skus,
         (SELECT count(*) FROM catalog.price_record WHERE org_id = 'org-demo' AND superseded_at IS NULL)::text AS prices,
         (SELECT count(*) FROM catalog.cost_record WHERE org_id = 'org-demo' AND superseded_at IS NULL)::text AS costs`
    );
    expect(counts.rows[0]).toEqual({ skus: "1000", prices: "3000", costs: "1000" });
  });
});
