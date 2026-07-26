import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { toJson } from "@bufbuild/protobuf";
import {
  SkuSchema,
  CostRecordSchema,
  PriceRecordSchema,
  ChannelSchema,
  LocationSchema,
  CustomerSegmentSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import type { CatalogSnapshotClient } from "../clients/catalog.js";

export interface SnapshotData {
  snapshotId: string;
  orgId: string;
  snapshotAt: string;
  scope: "catalog";
  tables: {
    skus: unknown[];
    channels: unknown[];
    locations: unknown[];
    customer_segments: unknown[];
    cost_records: unknown[];
    price_records: unknown[];
  };
}

export interface SnapshotResult {
  snapshotId: string;
  data: Buffer;
  checksum: string;
  rowCounts: Record<string, number>;
  snapshotAt: string;
}

export async function buildSnapshot(
  catalogClient: CatalogSnapshotClient,
  orgId: string,
  snapshotId: string,
): Promise<SnapshotResult> {
  const snapshotAt = new Date().toISOString();

  const [skus, channels, locations, segments] = await Promise.all([
    catalogClient.listAllSkus(orgId),
    catalogClient.listAllChannels(orgId),
    catalogClient.listAllLocations(orgId),
    catalogClient.listAllCustomerSegments(orgId),
  ]);

  const skuIds = skus.map((s) => s.id);

  const [costs, prices] = skuIds.length > 0
    ? await Promise.all([
        catalogClient.batchGetCosts(orgId, skuIds),
        catalogClient.batchGetPrices(orgId, skuIds),
      ])
    : [[], []];

  const payload: SnapshotData = {
    snapshotId,
    orgId,
    snapshotAt,
    scope: "catalog",
    tables: {
      skus: skus.map((s) => toJson(SkuSchema, s)),
      channels: channels.map((c) => toJson(ChannelSchema, c)),
      locations: locations.map((l) => toJson(LocationSchema, l)),
      customer_segments: segments.map((s) => toJson(CustomerSegmentSchema, s)),
      cost_records: costs.map((c) => toJson(CostRecordSchema, c)),
      price_records: prices.map((p) => toJson(PriceRecordSchema, p)),
    },
  };

  const json = JSON.stringify(payload);
  const compressed = gzipSync(Buffer.from(json, "utf-8"));
  const checksum = createHash("sha256").update(compressed).digest("hex");

  const rowCounts: Record<string, number> = {
    skus: skus.length,
    channels: channels.length,
    locations: locations.length,
    customer_segments: segments.length,
    cost_records: costs.length,
    price_records: prices.length,
  };

  return {
    snapshotId,
    data: compressed,
    checksum,
    rowCounts,
    snapshotAt,
  };
}
