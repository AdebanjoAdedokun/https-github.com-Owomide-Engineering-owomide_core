import { Code, ConnectError } from "@connectrpc/connect";
import type { PoolClient, QueryResultRow } from "pg";
import type {
  SaveChannelRequest,
  SaveCustomerSegmentRequest,
  SaveLocationRequest,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { decodeCursor, encodeCursor, pageSize } from "../domain/pagination.js";
import {
  normalizeCountry,
  normalizeCurrency,
  normalizeKey,
  parseAttributes,
} from "../domain/normalize.js";
import {
  channelMessage,
  customerSegmentMessage,
  locationMessage,
  type ChannelRow,
  type CustomerSegmentRow,
  type LocationRow,
} from "./mappers.js";

interface ReferenceListRequest {
  includeArchived: boolean;
  pagination?: { pageSize: number; pageToken: string };
}

async function listRows<T extends { id: string; code_normalized: string }>(
  client: PoolClient,
  table: "channel" | "location" | "customer_segment",
  request: ReferenceListRequest
): Promise<{ rows: T[]; nextPageToken: string; totalCount: number }> {
  const limit = pageSize(request.pagination?.pageSize ?? 0);
  const cursor = decodeCursor(request.pagination?.pageToken ?? "");
  const conditions = request.includeArchived ? ["TRUE"] : ["archived_at IS NULL"];
  const values: unknown[] = [];
  if (cursor) {
    values.push(cursor.key, cursor.id);
    conditions.push("(code_normalized, id) > ($1, $2::uuid)");
  }
  const countResult = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM catalog.${table} WHERE ${request.includeArchived ? "TRUE" : "archived_at IS NULL"}`
  );
  values.push(limit + 1);
  const result = await client.query<T>(
    `SELECT * FROM catalog.${table} WHERE ${conditions.join(" AND ")}
     ORDER BY code_normalized, id LIMIT $${values.length}`,
    values
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  return {
    rows,
    nextPageToken: hasMore && last ? encodeCursor({ key: last.code_normalized, id: last.id }) : "",
    totalCount: Number(countResult.rows[0]?.count ?? 0),
  };
}

async function deactivate<T extends QueryResultRow>(
  client: PoolClient,
  table: "channel" | "location" | "customer_segment",
  id: string
): Promise<T> {
  const result = await client.query<T>(
    `UPDATE catalog.${table}
     SET archived_at = COALESCE(archived_at, clock_timestamp())
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ConnectError("Reference data not found", Code.NotFound);
  return row;
}

export class ReferenceRepository {
  async listChannels(client: PoolClient, request: ReferenceListRequest) {
    const result = await listRows<ChannelRow>(client, "channel", request);
    return { ...result, rows: result.rows.map(channelMessage) };
  }

  async saveChannel(client: PoolClient, orgId: string, request: SaveChannelRequest) {
    const codeNormalized = normalizeKey(request.code, "channel.code");
    const currency = normalizeCurrency(request.defaultCurrency);
    const attributes = parseAttributes(request.attributesJson);
    const values = [
      orgId,
      request.code.trim(),
      codeNormalized,
      request.name.trim(),
      currency,
      attributes,
    ];
    if (!request.name.trim())
      throw new ConnectError("channel.name is required", Code.InvalidArgument);
    const result = request.id
      ? await client.query<ChannelRow>(
          `UPDATE catalog.channel SET code = $2, code_normalized = $3, name = $4,
             default_currency = $5, attributes = $6
           WHERE org_id = $1 AND id = $7 RETURNING *`,
          [...values, request.id]
        )
      : await client.query<ChannelRow>(
          `INSERT INTO catalog.channel (org_id, code, code_normalized, name, default_currency, attributes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL
           DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
             default_currency = EXCLUDED.default_currency, attributes = EXCLUDED.attributes
           RETURNING *`,
          values
        );
    const row = result.rows[0];
    if (!row) throw new ConnectError("Channel not found", Code.NotFound);
    return channelMessage(row);
  }

  async deactivateChannel(client: PoolClient, id: string) {
    return channelMessage(await deactivate<ChannelRow>(client, "channel", id));
  }

  async listLocations(client: PoolClient, request: ReferenceListRequest) {
    const result = await listRows<LocationRow>(client, "location", request);
    return { ...result, rows: result.rows.map(locationMessage) };
  }

  async saveLocation(client: PoolClient, orgId: string, request: SaveLocationRequest) {
    const codeNormalized = normalizeKey(request.code, "location.code");
    const country = normalizeCountry(request.country);
    const attributes = parseAttributes(request.attributesJson);
    if (!request.name.trim())
      throw new ConnectError("location.name is required", Code.InvalidArgument);
    const values = [
      orgId,
      request.code.trim(),
      codeNormalized,
      request.name.trim(),
      request.region ?? null,
      country,
      attributes,
    ];
    const result = request.id
      ? await client.query<LocationRow>(
          `UPDATE catalog.location SET code = $2, code_normalized = $3, name = $4,
             region = $5, country = $6, attributes = $7
           WHERE org_id = $1 AND id = $8 RETURNING *`,
          [...values, request.id]
        )
      : await client.query<LocationRow>(
          `INSERT INTO catalog.location (org_id, code, code_normalized, name, region, country, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL
           DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, region = EXCLUDED.region,
             country = EXCLUDED.country, attributes = EXCLUDED.attributes
           RETURNING *`,
          values
        );
    const row = result.rows[0];
    if (!row) throw new ConnectError("Location not found", Code.NotFound);
    return locationMessage(row);
  }

  async deactivateLocation(client: PoolClient, id: string) {
    return locationMessage(await deactivate<LocationRow>(client, "location", id));
  }

  async listCustomerSegments(client: PoolClient, request: ReferenceListRequest) {
    const result = await listRows<CustomerSegmentRow>(client, "customer_segment", request);
    return { ...result, rows: result.rows.map(customerSegmentMessage) };
  }

  async saveCustomerSegment(
    client: PoolClient,
    orgId: string,
    request: SaveCustomerSegmentRequest
  ) {
    const codeNormalized = normalizeKey(request.code, "customer_segment.code");
    const attributes = parseAttributes(request.attributesJson);
    if (!request.name.trim())
      throw new ConnectError("customer_segment.name is required", Code.InvalidArgument);
    const values = [orgId, request.code.trim(), codeNormalized, request.name.trim(), attributes];
    const result = request.id
      ? await client.query<CustomerSegmentRow>(
          `UPDATE catalog.customer_segment SET code = $2, code_normalized = $3, name = $4, attributes = $5
           WHERE org_id = $1 AND id = $6 RETURNING *`,
          [...values, request.id]
        )
      : await client.query<CustomerSegmentRow>(
          `INSERT INTO catalog.customer_segment (org_id, code, code_normalized, name, attributes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL
           DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, attributes = EXCLUDED.attributes
           RETURNING *`,
          values
        );
    const row = result.rows[0];
    if (!row) throw new ConnectError("Customer segment not found", Code.NotFound);
    return customerSegmentMessage(row);
  }

  async deactivateCustomerSegment(client: PoolClient, id: string) {
    return customerSegmentMessage(
      await deactivate<CustomerSegmentRow>(client, "customer_segment", id)
    );
  }
}
