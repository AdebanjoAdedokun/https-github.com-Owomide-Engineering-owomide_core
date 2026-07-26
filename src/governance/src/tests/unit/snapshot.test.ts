import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type {
  Sku,
  CostRecord,
  PriceRecord,
  Channel,
  Location,
  CustomerSegment,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { create } from "@bufbuild/protobuf";
import {
  SkuSchema,
  ChannelSchema,
  LocationSchema,
  CustomerSegmentSchema,
  CostRecordSchema,
  PriceRecordSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import type { CatalogSnapshotClient } from "../../clients/catalog.js";
import { buildSnapshot, type SnapshotData } from "../../domain/snapshot.js";

function stubCatalogClient(opts: {
  skus?: Sku[];
  channels?: Channel[];
  locations?: Location[];
  segments?: CustomerSegment[];
  costs?: CostRecord[];
  prices?: PriceRecord[];
}): CatalogSnapshotClient {
  return {
    listAllSkus: async () => opts.skus ?? [],
    listAllChannels: async () => opts.channels ?? [],
    listAllLocations: async () => opts.locations ?? [],
    listAllCustomerSegments: async () => opts.segments ?? [],
    batchGetCosts: async () => opts.costs ?? [],
    batchGetPrices: async () => opts.prices ?? [],
  };
}

const ORG = "org-snapshot-test";

describe("buildSnapshot", () => {
  it("produces valid gzipped JSON with correct structure", async () => {
    const sku: Sku = create(SkuSchema, { id: "sku-1", orgId: ORG, skuCode: "ABC-001" });
    const channel: Channel = create(ChannelSchema, {
      id: "ch-1",
      orgId: ORG,
      name: "Retail",
      code: "RETAIL",
      defaultCurrency: "NGN",
    });
    const location: Location = create(LocationSchema, {
      id: "loc-1",
      orgId: ORG,
      name: "Lagos",
      code: "LAGOS",
      country: "NG",
    });
    const segment: CustomerSegment = create(CustomerSegmentSchema, {
      id: "seg-1",
      orgId: ORG,
      name: "Enterprise",
      code: "ENTERPRISE",
    });
    const cost: CostRecord = create(CostRecordSchema, {
      id: "cost-1",
      orgId: ORG,
      skuId: "sku-1",
      costType: "standard",
      cost: create(MoneySchema, { amount: 100000n, currency: "NGN" }),
    });
    const price: PriceRecord = create(PriceRecordSchema, {
      id: "price-1",
      orgId: ORG,
      skuId: "sku-1",
      channelId: "ch-1",
      price: create(MoneySchema, { amount: 150000n, currency: "NGN" }),
    });

    const client = stubCatalogClient({
      skus: [sku],
      channels: [channel],
      locations: [location],
      segments: [segment],
      costs: [cost],
      prices: [price],
    });

    const result = await buildSnapshot(client, ORG, "snap-001");

    expect(result.snapshotId).toBe("snap-001");
    expect(result.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.data.length).toBeGreaterThan(0);

    const decompressed = gunzipSync(result.data);
    const parsed: SnapshotData = JSON.parse(decompressed.toString("utf-8"));

    expect(parsed.snapshotId).toBe("snap-001");
    expect(parsed.orgId).toBe(ORG);
    expect(parsed.scope).toBe("catalog");
    expect(parsed.tables.skus).toHaveLength(1);
    expect(parsed.tables.channels).toHaveLength(1);
    expect(parsed.tables.locations).toHaveLength(1);
    expect(parsed.tables.customer_segments).toHaveLength(1);
    expect(parsed.tables.cost_records).toHaveLength(1);
    expect(parsed.tables.price_records).toHaveLength(1);
  });

  it("returns correct row counts", async () => {
    const skus: Sku[] = [
      create(SkuSchema, { id: "sku-1", orgId: ORG, skuCode: "A" }),
      create(SkuSchema, { id: "sku-2", orgId: ORG, skuCode: "B" }),
    ];
    const client = stubCatalogClient({ skus });
    const result = await buildSnapshot(client, ORG, "snap-002");

    expect(result.rowCounts).toEqual({
      skus: 2,
      channels: 0,
      locations: 0,
      customer_segments: 0,
      cost_records: 0,
      price_records: 0,
    });
  });

  it("produces valid SHA-256 checksum of compressed data", async () => {
    const client = stubCatalogClient({});
    const result = await buildSnapshot(client, ORG, "snap-003");

    const expected = createHash("sha256").update(result.data).digest("hex");
    expect(result.checksum).toBe(expected);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips cost/price fetch when no SKUs exist", async () => {
    let costsCalled = false;
    let pricesCalled = false;
    const client: CatalogSnapshotClient = {
      listAllSkus: async () => [],
      listAllChannels: async () => [],
      listAllLocations: async () => [],
      listAllCustomerSegments: async () => [],
      batchGetCosts: async () => {
        costsCalled = true;
        return [];
      },
      batchGetPrices: async () => {
        pricesCalled = true;
        return [];
      },
    };

    await buildSnapshot(client, ORG, "snap-004");
    expect(costsCalled).toBe(false);
    expect(pricesCalled).toBe(false);
  });
});
