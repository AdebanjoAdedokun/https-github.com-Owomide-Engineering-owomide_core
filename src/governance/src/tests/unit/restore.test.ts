import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decompressAndVerify,
  buildDimensionRestoreOps,
  buildCanonicalRestoreOps,
} from "../../domain/restore.js";
import type { SnapshotData } from "../../domain/snapshot.js";

function makeSnapshot(overrides?: Partial<SnapshotData>): SnapshotData {
  return {
    snapshotId: "snap-1",
    orgId: "org-test",
    snapshotAt: "2026-07-01T00:00:00.000Z",
    scope: "catalog",
    tables: {
      skus: [],
      channels: [],
      locations: [],
      customer_segments: [],
      cost_records: [],
      price_records: [],
    },
    ...overrides,
  };
}

function compressAndChecksum(data: SnapshotData): { compressed: Buffer; checksum: string } {
  const compressed = gzipSync(Buffer.from(JSON.stringify(data), "utf-8"));
  const checksum = createHash("sha256").update(compressed).digest("hex");
  return { compressed, checksum };
}

describe("decompressAndVerify", () => {
  it("decompresses and parses valid snapshot data", () => {
    const snapshot = makeSnapshot({
      tables: {
        skus: [{ id: "sku-1", skuCode: "ABC" }],
        channels: [],
        locations: [],
        customer_segments: [],
        cost_records: [],
        price_records: [],
      },
    });
    const { compressed, checksum } = compressAndChecksum(snapshot);
    const result = decompressAndVerify(compressed, checksum);
    expect(result.scope).toBe("catalog");
    expect(result.tables.skus).toHaveLength(1);
  });

  it("throws on checksum mismatch", () => {
    const snapshot = makeSnapshot();
    const { compressed } = compressAndChecksum(snapshot);
    expect(() => decompressAndVerify(compressed, "bad-checksum")).toThrow("Checksum mismatch");
  });

  it("throws on malformed JSON", () => {
    const badData = gzipSync(Buffer.from("not-json", "utf-8"));
    const checksum = createHash("sha256").update(badData).digest("hex");
    expect(() => decompressAndVerify(badData, checksum)).toThrow();
  });

  it("throws on unsupported scope", () => {
    const snapshot = makeSnapshot({ scope: "full" as "catalog" });
    const { compressed, checksum } = compressAndChecksum(snapshot);
    expect(() => decompressAndVerify(compressed, checksum)).toThrow("Unsupported snapshot scope");
  });
});

describe("buildDimensionRestoreOps", () => {
  it("extracts channels, locations, and segments", () => {
    const snapshot = makeSnapshot({
      tables: {
        skus: [],
        channels: [
          { id: "ch-1", code: "RETAIL", name: "Retail", defaultCurrency: "NGN", attributesJson: "{}" },
          { id: "ch-2", code: "WHOLESALE", name: "Wholesale", defaultCurrency: "USD", attributesJson: "{}" },
        ],
        locations: [
          { id: "loc-1", code: "LAGOS", name: "Lagos", country: "NG", region: "West Africa", attributesJson: "{}" },
        ],
        customer_segments: [
          { id: "seg-1", code: "ENTERPRISE", name: "Enterprise", attributesJson: "{}" },
        ],
        cost_records: [],
        price_records: [],
      },
    });

    const ops = buildDimensionRestoreOps(snapshot);
    expect(ops.channels).toHaveLength(2);
    expect(ops.channels[0]).toEqual({
      id: "ch-1",
      code: "RETAIL",
      name: "Retail",
      defaultCurrency: "NGN",
      attributesJson: "{}",
    });
    expect(ops.locations).toHaveLength(1);
    expect(ops.locations[0]?.country).toBe("NG");
    expect(ops.locations[0]?.region).toBe("West Africa");
    expect(ops.segments).toHaveLength(1);
    expect(ops.segments[0]?.code).toBe("ENTERPRISE");
  });

  it("returns empty arrays when no dimensions exist", () => {
    const ops = buildDimensionRestoreOps(makeSnapshot());
    expect(ops.channels).toHaveLength(0);
    expect(ops.locations).toHaveLength(0);
    expect(ops.segments).toHaveLength(0);
  });
});

describe("buildCanonicalRestoreOps", () => {
  it("groups costs and prices by SKU", () => {
    const snapshot = makeSnapshot({
      tables: {
        skus: [{ id: "sku-1" }, { id: "sku-2" }],
        channels: [],
        locations: [],
        customer_segments: [],
        cost_records: [
          {
            id: "cost-1",
            skuId: "sku-1",
            costType: "standard",
            cost: { amount: "100000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
        ],
        price_records: [
          {
            id: "price-1",
            skuId: "sku-1",
            channelId: "ch-1",
            price: { amount: "150000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "price-2",
            skuId: "sku-2",
            channelId: "ch-1",
            price: { amount: "200000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });

    const batches = buildCanonicalRestoreOps(snapshot, "restore-1");
    expect(batches).toHaveLength(1);
    const rows = batches[0]!.rows;
    expect(rows.length).toBe(2);

    const sku1Row = rows.find((r) => r.skuId === "sku-1");
    expect(sku1Row?.cost?.costType).toBe("standard");
    expect(sku1Row?.cost?.amount).toBe(100000n);
    expect(sku1Row?.prices).toHaveLength(1);
    expect(sku1Row?.prices[0]?.channelId).toBe("ch-1");

    const sku2Row = rows.find((r) => r.skuId === "sku-2");
    expect(sku2Row?.cost).toBeUndefined();
    expect(sku2Row?.prices).toHaveLength(1);
  });

  it("creates multiple rows for a SKU with multiple costs", () => {
    const snapshot = makeSnapshot({
      tables: {
        skus: [{ id: "sku-1" }],
        channels: [],
        locations: [],
        customer_segments: [],
        cost_records: [
          {
            id: "cost-1",
            skuId: "sku-1",
            costType: "standard",
            cost: { amount: "100000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "cost-2",
            skuId: "sku-1",
            locationId: "loc-1",
            costType: "landed",
            cost: { amount: "120000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
        ],
        price_records: [
          {
            id: "price-1",
            skuId: "sku-1",
            channelId: "ch-1",
            price: { amount: "150000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });

    const batches = buildCanonicalRestoreOps(snapshot, "restore-2");
    const rows = batches[0]!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cost?.costType).toBe("standard");
    expect(rows[0]?.prices).toHaveLength(1);
    expect(rows[1]?.cost?.costType).toBe("landed");
    expect(rows[1]?.prices).toHaveLength(0);
  });

  it("batches at 500 rows", () => {
    const costRecords = Array.from({ length: 600 }, (_, i) => ({
      id: `cost-${i}`,
      skuId: `sku-${i}`,
      costType: "standard",
      cost: { amount: "10000", currency: "NGN" },
      effectiveAt: "2026-01-01T00:00:00Z",
    }));

    const snapshot = makeSnapshot({
      tables: {
        skus: Array.from({ length: 600 }, (_, i) => ({ id: `sku-${i}` })),
        channels: [],
        locations: [],
        customer_segments: [],
        cost_records: costRecords,
        price_records: [],
      },
    });

    const batches = buildCanonicalRestoreOps(snapshot, "restore-3");
    expect(batches).toHaveLength(2);
    expect(batches[0]!.rows.length).toBe(500);
    expect(batches[1]!.rows.length).toBe(100);
  });

  it("generates correct idempotency keys", () => {
    const snapshot = makeSnapshot({
      tables: {
        skus: [{ id: "sku-1" }],
        channels: [],
        locations: [],
        customer_segments: [],
        cost_records: [
          {
            id: "cost-1",
            skuId: "sku-1",
            costType: "standard",
            cost: { amount: "10000", currency: "NGN" },
            effectiveAt: "2026-01-01T00:00:00Z",
          },
        ],
        price_records: [],
      },
    });

    const batches = buildCanonicalRestoreOps(snapshot, "my-restore-id");
    expect(batches[0]!.idempotencyKey).toBe("restore:my-restore-id:batch:0");
    expect(batches[0]!.sourceRef).toBe("restore:my-restore-id");
  });
});
