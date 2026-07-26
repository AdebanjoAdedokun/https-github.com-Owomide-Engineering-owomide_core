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
  ListSkusRequestSchema,
  BatchGetCostsRequestSchema,
  BatchGetPricesRequestSchema,
  ListChannelsRequestSchema,
  ListLocationsRequestSchema,
  ListCustomerSegmentsRequestSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { PaginationSchema, type Pagination } from "@owomide/proto/common/v1/common_pb.js";

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

function pagination(pageToken: string): Pagination {
  return create(PaginationSchema, { pageSize: PAGE_SIZE, pageToken });
}

export class GrpcCatalogSnapshotClient implements CatalogSnapshotClient {
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
}
