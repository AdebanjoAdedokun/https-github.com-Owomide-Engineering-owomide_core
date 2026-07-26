import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { SnapshotData } from "./snapshot.js";
import type {
  SaveChannelInput,
  SaveLocationInput,
  SaveCustomerSegmentInput,
  CanonicalRestoreBatch,
  CanonicalRestoreRow,
} from "../clients/catalog.js";

const BATCH_SIZE = 500;

export interface DimensionRestoreOps {
  channels: SaveChannelInput[];
  locations: SaveLocationInput[];
  segments: SaveCustomerSegmentInput[];
}

interface SnapshotChannel {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string;
  attributesJson: string;
}

interface SnapshotLocation {
  id: string;
  code: string;
  name: string;
  country: string;
  region?: string;
  attributesJson: string;
}

interface SnapshotCustomerSegment {
  id: string;
  code: string;
  name: string;
  attributesJson: string;
}

interface SnapshotCostRecord {
  id: string;
  skuId: string;
  locationId?: string;
  costType: string;
  cost: { amount: string; currency: string };
  effectiveAt: string;
  effectiveUntil?: string;
}

interface SnapshotPriceRecord {
  id: string;
  skuId: string;
  channelId: string;
  locationId?: string;
  customerSegmentId?: string;
  price: { amount: string; currency: string };
  effectiveAt: string;
  effectiveUntil?: string;
}

export function decompressAndVerify(compressed: Buffer, expectedChecksum: string): SnapshotData {
  const checksum = createHash("sha256").update(compressed).digest("hex");
  if (checksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch: expected ${expectedChecksum}, got ${checksum}`);
  }
  const json = gunzipSync(compressed).toString("utf-8");
  const data = JSON.parse(json) as SnapshotData;
  if (data.scope !== "catalog") {
    throw new Error(`Unsupported snapshot scope: ${data.scope}`);
  }
  if (!data.tables) {
    throw new Error("Snapshot missing tables");
  }
  return data;
}

export function buildDimensionRestoreOps(snapshot: SnapshotData): DimensionRestoreOps {
  const channels = (snapshot.tables.channels as SnapshotChannel[]).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    defaultCurrency: c.defaultCurrency,
    attributesJson: c.attributesJson ?? "{}",
  }));

  const locations = (snapshot.tables.locations as SnapshotLocation[]).map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    country: l.country,
    region: l.region,
    attributesJson: l.attributesJson ?? "{}",
  }));

  const segments = (snapshot.tables.customer_segments as SnapshotCustomerSegment[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    attributesJson: s.attributesJson ?? "{}",
  }));

  return { channels, locations, segments };
}

export function buildCanonicalRestoreOps(
  snapshot: SnapshotData,
  restoreId: string,
): CanonicalRestoreBatch[] {
  const costs = snapshot.tables.cost_records as SnapshotCostRecord[];
  const prices = snapshot.tables.price_records as SnapshotPriceRecord[];

  const costsBySkuId = new Map<string, SnapshotCostRecord[]>();
  for (const cost of costs) {
    const existing = costsBySkuId.get(cost.skuId) ?? [];
    existing.push(cost);
    costsBySkuId.set(cost.skuId, existing);
  }

  const pricesBySkuId = new Map<string, SnapshotPriceRecord[]>();
  for (const price of prices) {
    const existing = pricesBySkuId.get(price.skuId) ?? [];
    existing.push(price);
    pricesBySkuId.set(price.skuId, existing);
  }

  const allSkuIds = new Set([...costsBySkuId.keys(), ...pricesBySkuId.keys()]);
  const rows: CanonicalRestoreRow[] = [];

  for (const skuId of allSkuIds) {
    const skuCosts = costsBySkuId.get(skuId) ?? [];
    const skuPrices = pricesBySkuId.get(skuId) ?? [];

    const mappedPrices = skuPrices.map((p) => ({
      channelId: p.channelId,
      locationId: p.locationId,
      customerSegmentId: p.customerSegmentId,
      amount: BigInt(p.price.amount),
      currency: p.price.currency,
      effectiveAt: new Date(p.effectiveAt),
      effectiveUntil: p.effectiveUntil ? new Date(p.effectiveUntil) : undefined,
    }));

    if (skuCosts.length === 0) {
      rows.push({
        sourceItemRef: `restore:${restoreId}:${skuId}`,
        skuId,
        prices: mappedPrices,
      });
    } else {
      for (let i = 0; i < skuCosts.length; i++) {
        const cost = skuCosts[i]!;
        rows.push({
          sourceItemRef: `restore:${restoreId}:${skuId}:cost:${i}`,
          skuId,
          cost: {
            locationId: cost.locationId,
            costType: cost.costType,
            amount: BigInt(cost.cost.amount),
            currency: cost.cost.currency,
            effectiveAt: new Date(cost.effectiveAt),
            effectiveUntil: cost.effectiveUntil ? new Date(cost.effectiveUntil) : undefined,
          },
          // Attach prices only to the first cost row to avoid duplicates
          prices: i === 0 ? mappedPrices : [],
        });
      }
    }
  }

  const batches: CanonicalRestoreBatch[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);
    batches.push({
      idempotencyKey: `restore:${restoreId}:batch:${batchIndex}`,
      sourceRef: `restore:${restoreId}`,
      rows: chunk,
    });
  }

  return batches;
}
