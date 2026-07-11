import { create } from "@bufbuild/protobuf";
import {
  ChannelSchema,
  CostRecordSchema,
  CustomerSegmentSchema,
  LocationSchema,
  PriceRecordSchema,
  ProductSchema,
  SkuIdentifierSchema,
  SkuSchema,
  SourceType,
  type Channel,
  type CostRecord,
  type CustomerSegment,
  type Location,
  type PriceRecord,
  type Product,
  type Sku,
  type SkuIdentifier,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import { dateToTimestamp } from "../domain/time.js";

export interface ProductRow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  category: string;
  manufacturer: string;
  attributes: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface SkuRow {
  id: string;
  org_id: string;
  product_id: string | null;
  sku_code: string;
  sku_code_normalized: string;
  pack_size: number | null;
  unit: string | null;
  attributes: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface SkuIdentifierRow {
  id: string;
  sku_id: string;
  identifier_type: string;
  namespace: string;
  raw_value: string;
  is_primary: boolean;
}

export interface ChannelRow {
  id: string;
  org_id: string;
  code: string;
  code_normalized: string;
  name: string;
  default_currency: string;
  attributes: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface LocationRow {
  id: string;
  org_id: string;
  code: string;
  code_normalized: string;
  name: string;
  region: string | null;
  country: string;
  attributes: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface CustomerSegmentRow {
  id: string;
  org_id: string;
  code: string;
  code_normalized: string;
  name: string;
  attributes: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface CostRecordRow {
  id: string;
  org_id: string;
  sku_id: string;
  location_id: string | null;
  cost_type: string;
  amount_minor: string;
  currency: string;
  effective_at: Date;
  effective_until: Date | null;
  recorded_at: Date;
  superseded_at: Date | null;
  source_type: string;
  source_ref: string;
  source_item_ref: string;
  actor_id: string | null;
}

export interface PriceRecordRow {
  id: string;
  org_id: string;
  sku_id: string;
  channel_id: string;
  location_id: string | null;
  customer_segment_id: string | null;
  amount_minor: string;
  currency: string;
  effective_at: Date;
  effective_until: Date | null;
  recorded_at: Date;
  superseded_at: Date | null;
  source_type: string;
  source_ref: string;
  source_item_ref: string;
  actor_id: string | null;
}

function sourceType(value: string): SourceType {
  switch (value) {
    case "import":
      return SourceType.IMPORT;
    case "proposal":
      return SourceType.PROPOSAL;
    case "manual":
      return SourceType.MANUAL;
    case "system":
      return SourceType.SYSTEM;
    case "migration":
      return SourceType.MIGRATION;
    default:
      return SourceType.UNSPECIFIED;
  }
}

export function productMessage(row: ProductRow): Product {
  return create(ProductSchema, {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    category: row.category,
    manufacturer: row.manufacturer,
    attributesJson: JSON.stringify(row.attributes),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
    archivedAt: dateToTimestamp(row.archived_at),
  });
}

export function identifierMessage(row: SkuIdentifierRow): SkuIdentifier {
  return create(SkuIdentifierSchema, {
    id: row.id,
    type: row.identifier_type,
    namespace: row.namespace || undefined,
    value: row.raw_value,
    isPrimary: row.is_primary,
  });
}

export function skuMessage(row: SkuRow, identifiers: readonly SkuIdentifierRow[] = []): Sku {
  return create(SkuSchema, {
    id: row.id,
    orgId: row.org_id,
    productId: row.product_id ?? undefined,
    skuCode: row.sku_code,
    packSize: row.pack_size ?? undefined,
    unit: row.unit ?? undefined,
    attributesJson: JSON.stringify(row.attributes),
    identifiers: identifiers.map(identifierMessage),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
    archivedAt: dateToTimestamp(row.archived_at),
  });
}

export function channelMessage(row: ChannelRow): Channel {
  return create(ChannelSchema, {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    name: row.name,
    defaultCurrency: row.default_currency,
    attributesJson: JSON.stringify(row.attributes),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
    archivedAt: dateToTimestamp(row.archived_at),
  });
}

export function locationMessage(row: LocationRow): Location {
  return create(LocationSchema, {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    name: row.name,
    region: row.region ?? undefined,
    country: row.country,
    attributesJson: JSON.stringify(row.attributes),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
    archivedAt: dateToTimestamp(row.archived_at),
  });
}

export function customerSegmentMessage(row: CustomerSegmentRow): CustomerSegment {
  return create(CustomerSegmentSchema, {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    name: row.name,
    attributesJson: JSON.stringify(row.attributes),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
    archivedAt: dateToTimestamp(row.archived_at),
  });
}

export function costRecordMessage(row: CostRecordRow): CostRecord {
  return create(CostRecordSchema, {
    id: row.id,
    orgId: row.org_id,
    skuId: row.sku_id,
    locationId: row.location_id ?? undefined,
    costType: row.cost_type,
    cost: create(MoneySchema, { amount: BigInt(row.amount_minor), currency: row.currency }),
    effectiveAt: dateToTimestamp(row.effective_at),
    effectiveUntil: dateToTimestamp(row.effective_until),
    recordedAt: dateToTimestamp(row.recorded_at),
    supersededAt: dateToTimestamp(row.superseded_at),
    sourceType: sourceType(row.source_type),
    sourceRef: row.source_ref,
    sourceItemRef: row.source_item_ref,
    actorId: row.actor_id ?? undefined,
  });
}

export function priceRecordMessage(row: PriceRecordRow): PriceRecord {
  return create(PriceRecordSchema, {
    id: row.id,
    orgId: row.org_id,
    skuId: row.sku_id,
    channelId: row.channel_id,
    locationId: row.location_id ?? undefined,
    customerSegmentId: row.customer_segment_id ?? undefined,
    price: create(MoneySchema, { amount: BigInt(row.amount_minor), currency: row.currency }),
    effectiveAt: dateToTimestamp(row.effective_at),
    effectiveUntil: dateToTimestamp(row.effective_until),
    recordedAt: dateToTimestamp(row.recorded_at),
    supersededAt: dateToTimestamp(row.superseded_at),
    sourceType: sourceType(row.source_type),
    sourceRef: row.source_ref,
    sourceItemRef: row.source_item_ref,
    actorId: row.actor_id ?? undefined,
  });
}
