import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create } from "@bufbuild/protobuf";
import { createClient, createRouterTransport, type ConnectRouter } from "@connectrpc/connect";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  CatalogService,
  SourceType,
  WriteStatus,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { Database } from "../../db.js";
import { dateToTimestamp } from "../../domain/time.js";
import { ServiceAuthenticator } from "../../context.js";
import { CatalogServiceImpl } from "../../service.js";

// Migration 0003: tax basis on price records, units on cost records, organisation pricing
// settings and the resolve functions (ADR-016; decision D-04; PRD DATA-003, DATA-004, DATA-022).
// Runs against a disposable container, or against CATALOG_TEST_DATABASE_URL (a superuser URL for
// an empty database) where containers are unavailable.

const MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_catalog_foundation.up.sql",
  "0003_tax_basis_cost_unit_resolution.up.sql",
];
const pipelineSecret = "pipeline-integration-secret-that-is-at-least-32-chars";
const ORG = "org-lagos-supermarket";
const OTHER_ORG = "org-other";
const JAN = "2026-01-01T00:00:00Z";
const NOW = "2026-09-27T12:00:00Z";

describe("Tax basis, cost units and resolution", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let database: Database;
  let client: ReturnType<typeof createClient<typeof CatalogService>>;
  let pipelineToken: string;

  beforeAll(async () => {
    let adminUrl = process.env.CATALOG_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("owomide_catalog_tax_test")
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
    for (const filename of MIGRATIONS) {
      await admin.query(readFileSync(resolve(process.cwd(), "migrations", filename), "utf8"));
    }
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = "catalog_svc";
    runtimeUrl.password = "catalog_test";
    database = new Database({
      databaseUrl: runtimeUrl.toString(),
      databasePoolSize: 4,
      databaseStatementTimeoutMs: 20_000,
    });
    const authenticator = new ServiceAuthenticator("owomide-internal", {
      data_pipeline_svc: pipelineSecret,
    });
    const service = new CatalogServiceImpl(database, authenticator);
    const transport = createRouterTransport((router: ConnectRouter) =>
      router.service(CatalogService, service.implementation)
    );
    client = createClient(CatalogService, transport);
    pipelineToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("owomide-internal")
      .setSubject("data_pipeline_svc")
      .setAudience("catalog")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(pipelineSecret));
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    for (const filename of [...MIGRATIONS].reverse()) {
      const down = filename.replace(".up.sql", ".down.sql");
      await admin?.query(readFileSync(resolve(process.cwd(), "migrations", down), "utf8"));
    }
    await admin?.end();
    await container?.stop();
  }, 120_000);

  const headers = () =>
    new Headers({
      authorization: `Bearer ${pipelineToken}`,
      "x-org-id": ORG,
      "x-user-id": "user-ada",
      "x-user-roles": "analyst",
    });

  const asOrg = <T>(org: string, fn: (db: pg.PoolClient) => Promise<T>) =>
    database.withOrgTransaction(org, fn);

  async function importPrice(skuCode: string, amount: bigint, channelId: string, key: string) {
    return client.upsertCanonical(
      {
        idempotencyKey: key,
        source: { sourceType: SourceType.IMPORT, sourceRef: key, actorId: "user-ada" },
        rows: [
          {
            sourceItemRef: "row-1",
            skuIdentity: { key: { case: "skuCode", value: skuCode } },
            newSku: { skuCode },
            prices: [
              {
                channelId,
                price: create(MoneySchema, { amount, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date(JAN)),
              },
            ],
          },
        ],
      },
      { headers: headers() }
    );
  }

  const configure = (inclusive: boolean | null, rateBp: number | null, costBasis = "landed") =>
    asOrg(ORG, async (db) => {
      const row = await db.query<{ id: string }>(
        "SELECT catalog.configure_pricing_settings($1, $2, $3, 'NGN', 'user-owner') AS id",
        [inclusive, rateBp, costBasis]
      );
      return row.rows[0]!.id;
    });

  const priceRows = (skuId: string) =>
    asOrg(ORG, async (db) => {
      const result = await db.query(
        `SELECT amount_minor::text, tax_inclusive, tax_rate_bp, tax_basis_source, effective_at,
                effective_until, superseded_at IS NOT NULL AS superseded
         FROM catalog.price_record WHERE sku_id = $1 ORDER BY recorded_at, effective_at`,
        [skuId]
      );
      return result.rows;
    });

  let defaultChannel: string;
  let skuBeforeSettings: string;
  let skuAfterSettings: string;

  it("stores a price imported before any settings exist as 'unspecified', never as tax-exclusive", async () => {
    // A channel must exist before settings do, so create the default channel the hard way first.
    defaultChannel = await asOrg(ORG, async (db) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO catalog.channel (org_id, code, code_normalized, name, default_currency)
         VALUES ($1, 'default', 'default', 'Organisation-wide price', 'NGN') RETURNING id`,
        [ORG]
      );
      return r.rows[0]!.id;
    });
    const result = await importPrice("BEV-00001", 118_000n, defaultChannel, "early-import");
    expect(result.results[0]?.status).toBe(WriteStatus.CREATED);
    skuBeforeSettings = result.results[0]!.skuId!;
    const [row] = await priceRows(skuBeforeSettings);
    expect(row).toMatchObject({
      tax_inclusive: null,
      tax_rate_bp: null,
      tax_basis_source: "unspecified",
    });
  });

  it("configures the D-04 settings, reuses the existing default channel and refuses bad settings", async () => {
    const channel = await configure(true, 750);
    expect(channel).toBe(defaultChannel);
    await expect(configure(true, null)).rejects.toThrow(/check constraint/);
    const settings = await asOrg(
      ORG,
      async (db) => (await db.query("SELECT * FROM catalog.pricing_settings")).rows
    );
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({
      default_tax_inclusive: true,
      default_tax_rate_bp: 750,
      calculation_cost_basis: "landed",
      default_channel_id: defaultChannel,
    });
    // Another organisation sees none of it.
    const other = await asOrg(
      OTHER_ORG,
      async (db) =>
        (await db.query("SELECT count(*)::int AS n FROM catalog.pricing_settings")).rows[0]
    );
    expect(other.n).toBe(0);
  });

  it("stamps the organisation default on a new price that does not state its basis", async () => {
    const result = await importPrice("BEV-00002", 53_750n, defaultChannel, "later-import");
    skuAfterSettings = result.results[0]!.skuId!;
    const [row] = await priceRows(skuAfterSettings);
    expect(row).toMatchObject({
      tax_inclusive: true,
      tax_rate_bp: 750,
      tax_basis_source: "organisation_default",
    });
  });

  it("replaces an 'unspecified' record on re-import once a default exists, and is unchanged after that", async () => {
    const reimport = await importPrice("BEV-00001", 118_000n, defaultChannel, "reimport-1");
    expect(reimport.results[0]?.status).toBe(WriteStatus.UPDATED);
    const again = await importPrice("BEV-00001", 118_000n, defaultChannel, "reimport-2");
    expect(again.results[0]?.status).toBe(WriteStatus.UNCHANGED);
    const rows = await priceRows(skuBeforeSettings);
    expect(rows.map((r) => [r.tax_basis_source, r.superseded])).toEqual([
      ["unspecified", true],
      ["organisation_default", false],
    ]);
  });

  it("keeps the parent's tax basis on fragments when a future price splits a record", async () => {
    await asOrg(ORG, async (db) => {
      // Record an explicit VAT-exclusive price, then split it with a future-dated import.
      await db.query(
        `UPDATE catalog.pricing_settings SET default_tax_inclusive = false, default_tax_rate_bp = NULL`
      );
    });
    const sku = (await importPrice("BEV-00003", 10_000n, defaultChannel, "split-base")).results[0]!
      .skuId!;
    await configure(true, 750);
    await client.upsertCanonical(
      {
        idempotencyKey: "split-future",
        source: { sourceType: SourceType.IMPORT, sourceRef: "split-future", actorId: "user-ada" },
        rows: [
          {
            sourceItemRef: "row-1",
            skuIdentity: { key: { case: "skuCode", value: "BEV-00003" } },
            prices: [
              {
                channelId: defaultChannel,
                price: create(MoneySchema, { amount: 12_000n, currency: "NGN" }),
                effectiveAt: dateToTimestamp(new Date("2026-06-01T00:00:00Z")),
              },
            ],
          },
        ],
      },
      { headers: headers() }
    );
    const current = (await priceRows(sku)).filter((r) => !r.superseded);
    expect(current.map((r) => [r.amount_minor, r.tax_inclusive, r.tax_basis_source])).toEqual([
      ["10000", false, "organisation_default"], // the January fragment keeps its original basis
      ["12000", true, "organisation_default"], // the new record takes today's default
    ]);
  });

  it("resolves Current Prices for exact contexts only, in input order, with reasons", async () => {
    const otherChannel = await asOrg(ORG, async (db) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO catalog.channel (org_id, code, code_normalized, name, default_currency)
         VALUES ($1, 'online', 'online', 'Online', 'NGN') RETURNING id`,
        [ORG]
      );
      return r.rows[0]!.id;
    });
    const contexts = [
      { sku_id: skuAfterSettings, channel_id: defaultChannel, currency: "NGN" },
      { sku_id: skuAfterSettings, channel_id: otherChannel, currency: "NGN" }, // never borrowed
      { sku_id: skuAfterSettings, channel_id: defaultChannel, currency: "USD" },
    ];
    const rows = await asOrg(
      ORG,
      async (db) =>
        (
          await db.query(
            `SELECT ordinal::int, amount_minor::text, tax_inclusive, tax_rate_bp, unavailable_reason
           FROM catalog.resolve_current_prices($1::jsonb, $2)`,
            [JSON.stringify(contexts), NOW]
          )
        ).rows
    );
    expect(rows).toEqual([
      {
        ordinal: 1,
        amount_minor: "53750",
        tax_inclusive: true,
        tax_rate_bp: 750,
        unavailable_reason: null,
      },
      {
        ordinal: 2,
        amount_minor: null,
        tax_inclusive: null,
        tax_rate_bp: null,
        unavailable_reason: "NO_APPLICABLE_PRICE_RECORD",
      },
      {
        ordinal: 3,
        amount_minor: null,
        tax_inclusive: null,
        tax_rate_bp: null,
        unavailable_reason: "NO_APPLICABLE_PRICE_RECORD",
      },
    ]);

    // A future-effective record is not current before it starts.
    const before = await asOrg(
      ORG,
      async (db) =>
        (
          await db.query(
            `SELECT unavailable_reason FROM catalog.resolve_current_prices($1::jsonb, $2)`,
            [JSON.stringify([contexts[0]]), "2025-12-31T23:59:59Z"]
          )
        ).rows[0]
    );
    expect(before.unavailable_reason).toBe("NO_APPLICABLE_PRICE_RECORD");

    // Another organisation cannot resolve this organisation's prices.
    const foreign = await asOrg(
      OTHER_ORG,
      async (db) =>
        (
          await db.query(
            `SELECT unavailable_reason FROM catalog.resolve_current_prices($1::jsonb, $2)`,
            [JSON.stringify([contexts[0]]), NOW]
          )
        ).rows[0]
    );
    expect(foreign.unavailable_reason).toBe("NO_APPLICABLE_PRICE_RECORD");
  });

  it("reports TAX_BASIS_MISSING for an unspecified record instead of guessing", async () => {
    const reason = await asOrg(ORG, async (db) => {
      const sku = await db.query<{ id: string }>(
        `INSERT INTO catalog.sku (org_id, sku_code, sku_code_normalized) VALUES ($1, 'X-1', 'x-1') RETURNING id`,
        [ORG]
      );
      const op = await db.query<{ id: string }>(
        `INSERT INTO catalog.write_operation (org_id, caller_service, operation_type, idempotency_key, payload_sha256, status)
         VALUES ($1, 'test', 'upsert_canonical', 'manual-x1', repeat('a', 64), 'in_progress') RETURNING id`,
        [ORG]
      );
      // With a default configured the record would be stamped, so clear the default first.
      await db.query(
        "UPDATE catalog.pricing_settings SET default_tax_inclusive = NULL, default_tax_rate_bp = NULL"
      );
      await db.query(
        `INSERT INTO catalog.price_record (org_id, sku_id, channel_id, amount_minor, currency, effective_at,
           recorded_at, source_type, source_ref, source_item_ref, write_operation_id)
         VALUES ($1, $2, $3, 500, 'NGN', $4, now(), 'manual', 'm', 'm', $5)`,
        [ORG, sku.rows[0]!.id, defaultChannel, JAN, op.rows[0]!.id]
      );
      const r = await db.query(
        `SELECT unavailable_reason, tax_basis_source FROM catalog.resolve_current_prices($1::jsonb, $2)`,
        [
          JSON.stringify([
            { sku_id: sku.rows[0]!.id, channel_id: defaultChannel, currency: "NGN" },
          ]),
          NOW,
        ]
      );
      return r.rows[0];
    });
    expect(reason).toEqual({
      unavailable_reason: "TAX_BASIS_MISSING",
      tax_basis_source: "unspecified",
    });
    await configure(true, 750);
  });

  it("resolves Applicable Unit Costs on the configured basis, preferring the exact location", async () => {
    const out = await asOrg(ORG, async (db) => {
      const loc = await db.query<{ id: string }>(
        `INSERT INTO catalog.location (org_id, code, code_normalized, name, country)
         VALUES ($1, 'LEKKI', 'lekki', 'Lekki', 'NG') RETURNING id`,
        [ORG]
      );
      const lekki = loc.rows[0]!.id;
      const op = await db.query<{ id: string }>(
        `INSERT INTO catalog.write_operation (org_id, caller_service, operation_type, idempotency_key, payload_sha256, status)
         VALUES ($1, 'test', 'upsert_canonical', 'costs', repeat('b', 64), 'in_progress') RETURNING id`,
        [ORG]
      );
      const insertCost = (
        sku: string,
        location: string | null,
        type: string,
        amount: number,
        currency: string,
        unit: string
      ) =>
        db.query(
          `INSERT INTO catalog.cost_record (org_id, sku_id, location_id, cost_type, amount_minor, currency, unit,
             effective_at, recorded_at, source_type, source_ref, source_item_ref, write_operation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), 'import', 'c', 'c', $9)`,
          [ORG, sku, location, type, amount, currency, unit, JAN, op.rows[0]!.id]
        );
      await insertCost(skuAfterSettings, null, "landed", 40_000, "NGN", "each");
      await insertCost(skuAfterSettings, lekki, "landed", 41_000, "NGN", "each");
      await insertCost(skuAfterSettings, null, "purchase", 35_000, "NGN", "each"); // context only
      await insertCost(skuBeforeSettings, null, "landed", 90_000, "USD", "each");
      await insertCost(skuBeforeSettings, lekki, "landed", 80_000, "NGN", "carton");

      const otherLoc = await db.query<{ id: string }>(
        `INSERT INTO catalog.location (org_id, code, code_normalized, name, country)
         VALUES ($1, 'IKEJA', 'ikeja', 'Ikeja', 'NG') RETURNING id`,
        [ORG]
      );
      const contexts = [
        { sku_id: skuAfterSettings, location_id: lekki, currency: "NGN", unit: "each" },
        { sku_id: skuAfterSettings, location_id: otherLoc.rows[0]!.id, currency: "NGN" },
        { sku_id: skuAfterSettings, currency: "NGN" },
        { sku_id: skuBeforeSettings, currency: "NGN" },
        { sku_id: skuBeforeSettings, location_id: lekki, currency: "NGN", unit: "each" },
      ];
      const r = await db.query(
        `SELECT ordinal::int, cost_type, amount_minor::text, unit, unavailable_reason
         FROM catalog.resolve_applicable_costs($1::jsonb, $2)`,
        [JSON.stringify(contexts), NOW]
      );
      return r.rows;
    });
    expect(out).toEqual([
      {
        ordinal: 1,
        cost_type: "landed",
        amount_minor: "41000",
        unit: "each",
        unavailable_reason: null,
      },
      // Ikeja has no record of its own, so the location-less record applies (C-6).
      {
        ordinal: 2,
        cost_type: "landed",
        amount_minor: "40000",
        unit: "each",
        unavailable_reason: null,
      },
      {
        ordinal: 3,
        cost_type: "landed",
        amount_minor: "40000",
        unit: "each",
        unavailable_reason: null,
      },
      {
        ordinal: 4,
        cost_type: null,
        amount_minor: null,
        unit: null,
        unavailable_reason: "COST_CURRENCY_INCOMPATIBLE",
      },
      {
        ordinal: 5,
        cost_type: "landed",
        amount_minor: null,
        unit: "carton",
        unavailable_reason: "COST_UNIT_INCOMPATIBLE",
      },
    ]);
  });

  it("asks for a cost basis when the organisation has not configured one", async () => {
    const r = await asOrg(
      OTHER_ORG,
      async (db) =>
        (
          await db.query(
            `SELECT unavailable_reason FROM catalog.resolve_applicable_costs($1::jsonb, $2)`,
            [JSON.stringify([{ sku_id: skuAfterSettings, currency: "NGN" }]), NOW]
          )
        ).rows[0]
    );
    expect(r.unavailable_reason).toBe("COST_BASIS_REQUIRES_SELECTION");
  });
});
