import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { SignJWT } from "jose";
import { create } from "@bufbuild/protobuf";
import {
  CatalogService,
  type Sku,
  type CostRecord,
  type PriceRecord,
  type Channel,
  type Location,
  type CustomerSegment,
  type ListSkusRequest,
  type ListSkusResponse,
  type BatchGetCostsRequest,
  type BatchGetCostsResponse,
  type BatchGetPricesRequest,
  type BatchGetPricesResponse,
  type ListChannelsRequest,
  type ListChannelsResponse,
  type ListLocationsRequest,
  type ListLocationsResponse,
  type ListCustomerSegmentsRequest,
  type ListCustomerSegmentsResponse,
  type SaveChannelRequest,
  type SaveLocationRequest,
  type SaveCustomerSegmentRequest,
  type UpsertCanonicalRequest,
  type UpsertCanonicalResponse,
  type CanonicalWriteRow,
  ListSkusRequestSchema,
  BatchGetCostsRequestSchema,
  BatchGetPricesRequestSchema,
  ListChannelsRequestSchema,
  ListLocationsRequestSchema,
  ListCustomerSegmentsRequestSchema,
  SaveChannelRequestSchema,
  SaveLocationRequestSchema,
  SaveCustomerSegmentRequestSchema,
  UpsertCanonicalRequestSchema,
  CanonicalWriteRowSchema,
  SourceContextSchema,
  SourceType,
  SkuIdentitySchema,
  CostWriteSchema,
  PriceWriteSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MoneySchema, PaginationSchema, type Pagination } from "@owomide/proto/common/v1/common_pb.js";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

const SKU_CHUNK_SIZE = 500;
const PAGE_SIZE = 500;

export interface CatalogSnapshotClient {
  listAllSkus(orgId: string): Promise<Sku[]>;
  batchGetCosts(orgId: string, skuIds: string[]): Promise<CostRecord[]>;
  batchGetPrices(orgId: string, skuIds: string[]): Promise<PriceRecord[]>;
  listAllChannels(orgId: string): Promise<Channel[]>;
  listAllLocations(orgId: string): Promise<Location[]>;
  listAllCustomerSegments(orgId: string): Promise<CustomerSegment[]>;
}

export interface SaveChannelInput {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string;
  attributesJson: string;
}

export interface SaveLocationInput {
  id: string;
  code: string;
  name: string;
  country: string;
  region?: string;
  attributesJson: string;
}

export interface SaveCustomerSegmentInput {
  id: string;
  code: string;
  name: string;
  attributesJson: string;
}

export interface CanonicalRestoreBatch {
  idempotencyKey: string;
  sourceRef: string;
  rows: CanonicalRestoreRow[];
}

export interface CanonicalRestoreRow {
  sourceItemRef: string;
  skuId: string;
  cost?: {
    locationId?: string;
    costType: string;
    amount: bigint;
    currency: string;
    effectiveAt: Date;
    effectiveUntil?: Date;
  };
  prices: Array<{
    channelId: string;
    locationId?: string;
    customerSegmentId?: string;
    amount: bigint;
    currency: string;
    effectiveAt: Date;
    effectiveUntil?: Date;
  }>;
}

export interface CatalogRestoreClient extends CatalogSnapshotClient {
  saveChannel(orgId: string, channel: SaveChannelInput): Promise<void>;
  saveLocation(orgId: string, location: SaveLocationInput): Promise<void>;
  saveCustomerSegment(orgId: string, segment: SaveCustomerSegmentInput): Promise<void>;
  upsertCanonical(orgId: string, batch: CanonicalRestoreBatch): Promise<UpsertCanonicalResponse>;
}

function pagination(pageToken: string): Pagination {
  return create(PaginationSchema, { pageSize: PAGE_SIZE, pageToken });
}

export class GrpcCatalogSnapshotClient implements CatalogRestoreClient {
  private readonly client: ReturnType<typeof createClient<typeof CatalogService>>;
  private readonly secret: string;
  private readonly issuer: string;

  constructor(baseUrl: string, secret: string, issuer: string) {
    this.client = createClient(CatalogService, createGrpcTransport({ baseUrl }));
    this.secret = secret;
    this.issuer = issuer;
  }

  private async headers(orgId: string): Promise<Headers> {
    const h = new Headers();
    h.set("x-org-id", orgId);
    if (this.secret) {
      const jwt = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("governance_svc")
        .setAudience("catalog")
        .setIssuer(this.issuer)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(this.secret));
      h.set("Authorization", `Bearer ${jwt}`);
    }
    return h;
  }

  async listAllSkus(orgId: string): Promise<Sku[]> {
    const headers = await this.headers(orgId);
    const all: Sku[] = [];
    let pageToken = "";
    do {
      const req: ListSkusRequest = create(ListSkusRequestSchema, {
        pagination: pagination(pageToken),
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: ListSkusResponse = await this.client.listSkus!(req, { headers });
      all.push(...resp.skus);
      pageToken = resp.pagination?.nextPageToken ?? "";
    } while (pageToken);
    return all;
  }

  async batchGetCosts(orgId: string, skuIds: string[]): Promise<CostRecord[]> {
    const headers = await this.headers(orgId);
    const all: CostRecord[] = [];
    for (let i = 0; i < skuIds.length; i += SKU_CHUNK_SIZE) {
      const chunk = skuIds.slice(i, i + SKU_CHUNK_SIZE);
      const req: BatchGetCostsRequest = create(BatchGetCostsRequestSchema, { skuIds: chunk });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: BatchGetCostsResponse = await this.client.batchGetCosts!(req, { headers });
      all.push(...resp.costs);
    }
    return all;
  }

  async batchGetPrices(orgId: string, skuIds: string[]): Promise<PriceRecord[]> {
    const headers = await this.headers(orgId);
    const all: PriceRecord[] = [];
    for (let i = 0; i < skuIds.length; i += SKU_CHUNK_SIZE) {
      const chunk = skuIds.slice(i, i + SKU_CHUNK_SIZE);
      const req: BatchGetPricesRequest = create(BatchGetPricesRequestSchema, { skuIds: chunk });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: BatchGetPricesResponse = await this.client.batchGetPrices!(req, { headers });
      all.push(...resp.prices);
    }
    return all;
  }

  async listAllChannels(orgId: string): Promise<Channel[]> {
    const headers = await this.headers(orgId);
    const all: Channel[] = [];
    let pageToken = "";
    do {
      const req: ListChannelsRequest = create(ListChannelsRequestSchema, {
        pagination: pagination(pageToken),
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: ListChannelsResponse = await this.client.listChannels!(req, { headers });
      all.push(...resp.channels);
      pageToken = resp.pagination?.nextPageToken ?? "";
    } while (pageToken);
    return all;
  }

  async listAllLocations(orgId: string): Promise<Location[]> {
    const headers = await this.headers(orgId);
    const all: Location[] = [];
    let pageToken = "";
    do {
      const req: ListLocationsRequest = create(ListLocationsRequestSchema, {
        pagination: pagination(pageToken),
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: ListLocationsResponse = await this.client.listLocations!(req, { headers });
      all.push(...resp.locations);
      pageToken = resp.pagination?.nextPageToken ?? "";
    } while (pageToken);
    return all;
  }

  async listAllCustomerSegments(orgId: string): Promise<CustomerSegment[]> {
    const headers = await this.headers(orgId);
    const all: CustomerSegment[] = [];
    let pageToken = "";
    do {
      const req: ListCustomerSegmentsRequest = create(ListCustomerSegmentsRequestSchema, {
        pagination: pagination(pageToken),
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resp: ListCustomerSegmentsResponse = await this.client.listCustomerSegments!(req, { headers });
      all.push(...resp.customerSegments);
      pageToken = resp.pagination?.nextPageToken ?? "";
    } while (pageToken);
    return all;
  }

  async saveChannel(orgId: string, channel: SaveChannelInput): Promise<void> {
    const headers = await this.headers(orgId);
    const req: SaveChannelRequest = create(SaveChannelRequestSchema, {
      id: channel.id,
      code: channel.code,
      name: channel.name,
      defaultCurrency: channel.defaultCurrency,
      attributesJson: channel.attributesJson,
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await this.client.saveChannel!(req, { headers });
  }

  async saveLocation(orgId: string, location: SaveLocationInput): Promise<void> {
    const headers = await this.headers(orgId);
    const req: SaveLocationRequest = create(SaveLocationRequestSchema, {
      id: location.id,
      code: location.code,
      name: location.name,
      country: location.country,
      region: location.region,
      attributesJson: location.attributesJson,
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await this.client.saveLocation!(req, { headers });
  }

  async saveCustomerSegment(orgId: string, segment: SaveCustomerSegmentInput): Promise<void> {
    const headers = await this.headers(orgId);
    const req: SaveCustomerSegmentRequest = create(SaveCustomerSegmentRequestSchema, {
      id: segment.id,
      code: segment.code,
      name: segment.name,
      attributesJson: segment.attributesJson,
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await this.client.saveCustomerSegment!(req, { headers });
  }

  async upsertCanonical(orgId: string, batch: CanonicalRestoreBatch): Promise<UpsertCanonicalResponse> {
    const headers = await this.headers(orgId);
    const rows = batch.rows.map((row) => {
      const writeRow: CanonicalWriteRow = create(CanonicalWriteRowSchema, {
        sourceItemRef: row.sourceItemRef,
        skuIdentity: create(SkuIdentitySchema, { key: { case: "skuId", value: row.skuId } }),
      });
      if (row.cost) {
        writeRow.cost = create(CostWriteSchema, {
          locationId: row.cost.locationId,
          costType: row.cost.costType,
          cost: create(MoneySchema, { amount: row.cost.amount, currency: row.cost.currency }),
          effectiveAt: timestampFromDate(row.cost.effectiveAt),
          effectiveUntil: row.cost.effectiveUntil ? timestampFromDate(row.cost.effectiveUntil) : undefined,
        });
      }
      writeRow.prices = row.prices.map((p) =>
        create(PriceWriteSchema, {
          channelId: p.channelId,
          locationId: p.locationId,
          customerSegmentId: p.customerSegmentId,
          price: create(MoneySchema, { amount: p.amount, currency: p.currency }),
          effectiveAt: timestampFromDate(p.effectiveAt),
          effectiveUntil: p.effectiveUntil ? timestampFromDate(p.effectiveUntil) : undefined,
        }),
      );
      return writeRow;
    });
    const req: UpsertCanonicalRequest = create(UpsertCanonicalRequestSchema, {
      idempotencyKey: batch.idempotencyKey,
      source: create(SourceContextSchema, {
        sourceType: SourceType.SYSTEM,
        sourceRef: batch.sourceRef,
      }),
      rows,
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const resp: UpsertCanonicalResponse = await this.client.upsertCanonical!(req, { headers });
    return resp;
  }
}
