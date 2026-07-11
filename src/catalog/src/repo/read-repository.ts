import { Code, ConnectError } from "@connectrpc/connect";
import type { PoolClient } from "pg";
import type {
  BatchGetCostsRequest,
  BatchGetPricesRequest,
  ListSkusRequest,
  SkuIdentity,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { decodeCursor, encodeCursor, pageSize } from "../domain/pagination.js";
import { normalizeKey, normalizeNamespace } from "../domain/normalize.js";
import { timestampToDate } from "../domain/time.js";
import {
  costRecordMessage,
  priceRecordMessage,
  productMessage,
  skuMessage,
  type CostRecordRow,
  type PriceRecordRow,
  type ProductRow,
  type SkuIdentifierRow,
  type SkuRow,
} from "./mappers.js";

const MAX_BATCH_SIZE = 500;

function validateBatch(ids: readonly string[]): void {
  if (ids.length === 0) throw new ConnectError("At least one id is required", Code.InvalidArgument);
  if (ids.length > MAX_BATCH_SIZE)
    throw new ConnectError(`At most ${MAX_BATCH_SIZE} ids are allowed`, Code.InvalidArgument);
}

async function identifiersBySku(
  client: PoolClient,
  skuIds: readonly string[]
): Promise<Map<string, SkuIdentifierRow[]>> {
  const map = new Map<string, SkuIdentifierRow[]>();
  if (skuIds.length === 0) return map;
  const result = await client.query<SkuIdentifierRow>(
    `SELECT id, sku_id, identifier_type, namespace, raw_value, is_primary
     FROM catalog.sku_identifier
     WHERE sku_id = ANY($1::uuid[]) AND archived_at IS NULL
     ORDER BY sku_id, identifier_type, namespace, is_primary DESC, id`,
    [skuIds]
  );
  for (const row of result.rows) {
    const rows = map.get(row.sku_id) ?? [];
    rows.push(row);
    map.set(row.sku_id, rows);
  }
  return map;
}

export class ReadRepository {
  async getProduct(client: PoolClient, id: string) {
    const result = await client.query<ProductRow>(
      "SELECT * FROM catalog.product WHERE id = $1 AND archived_at IS NULL",
      [id]
    );
    const row = result.rows[0];
    if (!row) throw new ConnectError("Product not found", Code.NotFound);
    return productMessage(row);
  }

  async batchGetProducts(client: PoolClient, ids: readonly string[]) {
    validateBatch(ids);
    const result = await client.query<ProductRow>(
      "SELECT * FROM catalog.product WHERE id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY id",
      [ids]
    );
    return result.rows.map(productMessage);
  }

  async getSku(client: PoolClient, id: string) {
    const result = await client.query<SkuRow>(
      "SELECT * FROM catalog.sku WHERE id = $1 AND archived_at IS NULL",
      [id]
    );
    const row = result.rows[0];
    if (!row) throw new ConnectError("SKU not found", Code.NotFound);
    const identifiers = await identifiersBySku(client, [row.id]);
    return skuMessage(row, identifiers.get(row.id));
  }

  async batchGetSkus(client: PoolClient, ids: readonly string[]) {
    validateBatch(ids);
    const result = await client.query<SkuRow>(
      "SELECT * FROM catalog.sku WHERE id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY id",
      [ids]
    );
    const identifiers = await identifiersBySku(
      client,
      result.rows.map((row) => row.id)
    );
    return result.rows.map((row) => skuMessage(row, identifiers.get(row.id)));
  }

  async resolveSkuRow(client: PoolClient, identity: SkuIdentity | undefined): Promise<SkuRow> {
    const key = identity?.key;
    if (!key || key.case === undefined)
      throw new ConnectError("sku_identity is required", Code.InvalidArgument);
    let result;
    switch (key.case) {
      case "skuId":
        result = await client.query<SkuRow>(
          "SELECT * FROM catalog.sku WHERE id = $1 AND archived_at IS NULL",
          [key.value]
        );
        break;
      case "skuCode":
        result = await client.query<SkuRow>(
          "SELECT * FROM catalog.sku WHERE sku_code_normalized = $1 AND archived_at IS NULL",
          [normalizeKey(key.value, "sku_code")]
        );
        break;
      case "identifier":
        result = await client.query<SkuRow>(
          `SELECT sku.*
           FROM catalog.sku_identifier AS identifier
           JOIN catalog.sku AS sku ON sku.org_id = identifier.org_id AND sku.id = identifier.sku_id
           WHERE identifier.identifier_type = $1
             AND identifier.namespace = $2
             AND identifier.normalized_value = $3
             AND identifier.archived_at IS NULL
             AND sku.archived_at IS NULL`,
          [
            normalizeKey(key.value.type, "identifier.type").toLowerCase(),
            normalizeNamespace(key.value.namespace),
            normalizeKey(key.value.value, "identifier.value"),
          ]
        );
        break;
      default:
        throw new ConnectError("Unsupported SKU identity", Code.InvalidArgument);
    }
    if (result.rows.length === 0) throw new ConnectError("SKU not found", Code.NotFound);
    if (result.rows.length > 1)
      throw new ConnectError("SKU identity is ambiguous", Code.FailedPrecondition);
    return result.rows[0]!;
  }

  async resolveSku(client: PoolClient, identity: SkuIdentity | undefined) {
    const row = await this.resolveSkuRow(client, identity);
    const identifiers = await identifiersBySku(client, [row.id]);
    return skuMessage(row, identifiers.get(row.id));
  }

  async listSkus(client: PoolClient, request: ListSkusRequest) {
    const limit = pageSize(request.pagination?.pageSize ?? 0);
    const cursor = decodeCursor(request.pagination?.pageToken ?? "");
    const conditions = ["sku.archived_at IS NULL"];
    const values: unknown[] = [];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (request.productId) conditions.push(`sku.product_id = ${add(request.productId)}::uuid`);
    if (request.category) conditions.push(`product.category = ${add(request.category)}`);
    if (request.query)
      conditions.push(
        `sku.sku_code_normalized LIKE ${add(`${normalizeKey(request.query, "query")}%`)}`
      );
    if (request.channelId) {
      const channel = add(request.channelId);
      conditions.push(`EXISTS (
        SELECT 1 FROM catalog.price_record AS price
        WHERE price.sku_id = sku.id AND price.channel_id = ${channel}::uuid
          AND price.superseded_at IS NULL AND price.effective_period @> clock_timestamp()
      )`);
    }
    if (cursor) {
      const key = add(cursor.key);
      const id = add(cursor.id);
      conditions.push(`(sku.sku_code_normalized, sku.id) > (${key}, ${id}::uuid)`);
    }
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM catalog.sku AS sku
       LEFT JOIN catalog.product AS product ON product.org_id = sku.org_id AND product.id = sku.product_id
       WHERE ${conditions.filter((condition) => !condition.startsWith("(sku.sku_code_normalized")).join(" AND ")}`,
      cursor ? values.slice(0, -2) : values
    );
    values.push(limit + 1);
    const result = await client.query<SkuRow>(
      `SELECT sku.*
       FROM catalog.sku AS sku
       LEFT JOIN catalog.product AS product ON product.org_id = sku.org_id AND product.id = sku.product_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY sku.sku_code_normalized, sku.id
       LIMIT $${values.length}`,
      values
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const identifiers = await identifiersBySku(
      client,
      rows.map((row) => row.id)
    );
    const last = rows.at(-1);
    return {
      skus: rows.map((row) => skuMessage(row, identifiers.get(row.id))),
      nextPageToken:
        hasMore && last ? encodeCursor({ key: last.sku_code_normalized, id: last.id }) : "",
      totalCount: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  async batchGetCosts(client: PoolClient, request: BatchGetCostsRequest) {
    validateBatch(request.skuIds);
    const effectiveAsOf = timestampToDate(request.effectiveAsOf, "effective_as_of", new Date());
    const recordedAsOf = timestampToDate(request.recordedAsOf, "recorded_as_of", new Date());
    const conditions = [
      "sku_id = ANY($1::uuid[])",
      "effective_period @> $2::timestamptz",
      "recorded_at <= $3::timestamptz",
      "(superseded_at IS NULL OR superseded_at > $3::timestamptz)",
    ];
    const values: unknown[] = [request.skuIds, effectiveAsOf, recordedAsOf];
    if (request.locationId !== undefined) {
      values.push(request.locationId || null);
      conditions.push(`location_id IS NOT DISTINCT FROM $${values.length}::uuid`);
    }
    if (request.costType !== undefined) {
      values.push(request.costType);
      conditions.push(`cost_type = $${values.length}`);
    }
    const result = await client.query<CostRecordRow>(
      `SELECT * FROM catalog.cost_record WHERE ${conditions.join(" AND ")} ORDER BY sku_id, cost_type, location_id NULLS FIRST`,
      values
    );
    return result.rows.map(costRecordMessage);
  }

  async batchGetPrices(client: PoolClient, request: BatchGetPricesRequest) {
    validateBatch(request.skuIds);
    const effectiveAsOf = timestampToDate(request.effectiveAsOf, "effective_as_of", new Date());
    const recordedAsOf = timestampToDate(request.recordedAsOf, "recorded_as_of", new Date());
    const conditions = [
      "sku_id = ANY($1::uuid[])",
      "effective_period @> $2::timestamptz",
      "recorded_at <= $3::timestamptz",
      "(superseded_at IS NULL OR superseded_at > $3::timestamptz)",
    ];
    const values: unknown[] = [request.skuIds, effectiveAsOf, recordedAsOf];
    for (const [field, column] of [
      [request.channelId, "channel_id"],
      [request.locationId, "location_id"],
      [request.customerSegmentId, "customer_segment_id"],
    ] as const) {
      if (field !== undefined) {
        values.push(field || null);
        conditions.push(`${column} IS NOT DISTINCT FROM $${values.length}::uuid`);
      }
    }
    const result = await client.query<PriceRecordRow>(
      `SELECT * FROM catalog.price_record WHERE ${conditions.join(" AND ")}
       ORDER BY sku_id, channel_id, location_id NULLS FIRST, customer_segment_id NULLS FIRST`,
      values
    );
    return result.rows.map(priceRecordMessage);
  }
}
