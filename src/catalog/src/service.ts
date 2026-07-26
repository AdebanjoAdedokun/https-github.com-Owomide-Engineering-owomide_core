import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import { z } from "zod";
import { PaginatedResponseSchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  ApplyPriceChangesResponseSchema,
  BatchGetCostsResponseSchema,
  BatchGetPricesResponseSchema,
  BatchGetProductsResponseSchema,
  BatchGetSkusResponseSchema,
  CatalogService,
  DeactivateChannelResponseSchema,
  DeactivateCustomerSegmentResponseSchema,
  DeactivateLocationResponseSchema,
  GetProductResponseSchema,
  GetSkuResponseSchema,
  ListChannelsResponseSchema,
  ListCustomerSegmentsResponseSchema,
  ListLocationsResponseSchema,
  ListSkusResponseSchema,
  ResolveSkuResponseSchema,
  SaveChannelResponseSchema,
  SaveCustomerSegmentResponseSchema,
  SaveLocationResponseSchema,
  UpsertCanonicalResponseSchema,
  type ApplyPriceChangesRequest,
  type BatchGetCostsRequest,
  type BatchGetPricesRequest,
  type BatchGetProductsRequest,
  type BatchGetSkusRequest,
  type DeactivateChannelRequest,
  type DeactivateCustomerSegmentRequest,
  type DeactivateLocationRequest,
  type GetProductRequest,
  type GetSkuRequest,
  type ListChannelsRequest,
  type ListCustomerSegmentsRequest,
  type ListLocationsRequest,
  type ListSkusRequest,
  type ResolveSkuRequest,
  type SaveChannelRequest,
  type SaveCustomerSegmentRequest,
  type SaveLocationRequest,
  type UpsertCanonicalRequest,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { Database } from "./db.js";
import { requestContext, requireOrgAdmin, ServiceAuthenticator } from "./context.js";
import { ReadRepository } from "./repo/read-repository.js";
import { ReferenceRepository } from "./repo/reference-repository.js";
import { CatalogWriteEngine } from "./write-engine.js";

const UuidSchema = z.string().uuid();
const READ_CALLERS = [
  "gateway_svc",
  "data_pipeline_svc",
  "proposal_svc",
  "margin_svc",
  "governance_svc",
] as const;

function uuid(value: string, field: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new ConnectError(`${field} must be a UUID`, Code.InvalidArgument);
  return parsed.data;
}

function uuids(values: readonly string[], field: string): string[] {
  return values.map((value, index) => uuid(value, `${field}[${index}]`));
}

export class CatalogServiceImpl {
  readonly implementation: ServiceImpl<typeof CatalogService>;

  constructor(
    database: Database,
    private readonly authenticator: ServiceAuthenticator,
    private readonly reads = new ReadRepository(),
    private readonly references = new ReferenceRepository(),
    private readonly writes = new CatalogWriteEngine(database, reads)
  ) {
    this.implementation = {
      getProduct: async (request: GetProductRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const product = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.getProduct(client, uuid(request.id, "id"))
        );
        return create(GetProductResponseSchema, { product });
      },
      batchGetProducts: async (request: BatchGetProductsRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const products = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.batchGetProducts(client, uuids(request.ids, "ids"))
        );
        return create(BatchGetProductsResponseSchema, { products });
      },
      getSku: async (request: GetSkuRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const sku = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.getSku(client, uuid(request.id, "id"))
        );
        return create(GetSkuResponseSchema, { sku });
      },
      batchGetSkus: async (request: BatchGetSkusRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const skus = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.batchGetSkus(client, uuids(request.ids, "ids"))
        );
        return create(BatchGetSkusResponseSchema, { skus });
      },
      resolveSku: async (request: ResolveSkuRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        if (request.identity?.key.case === "skuId")
          uuid(request.identity.key.value, "identity.sku_id");
        const sku = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.resolveSku(client, request.identity)
        );
        return create(ResolveSkuResponseSchema, { sku });
      },
      listSkus: async (request: ListSkusRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        if (request.productId) uuid(request.productId, "product_id");
        if (request.channelId) uuid(request.channelId, "channel_id");
        const result = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.listSkus(client, request)
        );
        return create(ListSkusResponseSchema, {
          skus: result.skus,
          pagination: create(PaginatedResponseSchema, {
            nextPageToken: result.nextPageToken,
            totalCount: result.totalCount,
          }),
        });
      },
      batchGetCosts: async (request: BatchGetCostsRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        request.skuIds = uuids(request.skuIds, "sku_ids");
        if (request.locationId) uuid(request.locationId, "location_id");
        const costs = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.batchGetCosts(client, request)
        );
        return create(BatchGetCostsResponseSchema, { costs });
      },
      batchGetPrices: async (request: BatchGetPricesRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        request.skuIds = uuids(request.skuIds, "sku_ids");
        if (request.channelId) uuid(request.channelId, "channel_id");
        if (request.locationId) uuid(request.locationId, "location_id");
        if (request.customerSegmentId) uuid(request.customerSegmentId, "customer_segment_id");
        const prices = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.reads.batchGetPrices(client, request)
        );
        return create(BatchGetPricesResponseSchema, { prices });
      },
      listChannels: async (request: ListChannelsRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const result = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.listChannels(client, request)
        );
        return create(ListChannelsResponseSchema, {
          channels: result.rows,
          pagination: create(PaginatedResponseSchema, {
            nextPageToken: result.nextPageToken,
            totalCount: result.totalCount,
          }),
        });
      },
      saveChannel: async (request: SaveChannelRequest, context: HandlerContext) => {
        const ctx = await this.referenceWriteContext(context);
        if (request.id) uuid(request.id, "id");
        const channel = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.saveChannel(client, ctx.orgId, request)
        );
        return create(SaveChannelResponseSchema, { channel });
      },
      deactivateChannel: async (request: DeactivateChannelRequest, context: HandlerContext) => {
        const ctx = await this.referenceWriteContext(context);
        const channel = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.deactivateChannel(client, uuid(request.id, "id"))
        );
        return create(DeactivateChannelResponseSchema, { channel });
      },
      listLocations: async (request: ListLocationsRequest, context: HandlerContext) => {
        const ctx = await this.readContext(context);
        const result = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.listLocations(client, request)
        );
        return create(ListLocationsResponseSchema, {
          locations: result.rows,
          pagination: create(PaginatedResponseSchema, {
            nextPageToken: result.nextPageToken,
            totalCount: result.totalCount,
          }),
        });
      },
      saveLocation: async (request: SaveLocationRequest, context: HandlerContext) => {
        const ctx = await this.referenceWriteContext(context);
        if (request.id) uuid(request.id, "id");
        const location = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.saveLocation(client, ctx.orgId, request)
        );
        return create(SaveLocationResponseSchema, { location });
      },
      deactivateLocation: async (request: DeactivateLocationRequest, context: HandlerContext) => {
        const ctx = await this.referenceWriteContext(context);
        const location = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.deactivateLocation(client, uuid(request.id, "id"))
        );
        return create(DeactivateLocationResponseSchema, { location });
      },
      listCustomerSegments: async (
        request: ListCustomerSegmentsRequest,
        context: HandlerContext
      ) => {
        const ctx = await this.readContext(context);
        const result = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.listCustomerSegments(client, request)
        );
        return create(ListCustomerSegmentsResponseSchema, {
          customerSegments: result.rows,
          pagination: create(PaginatedResponseSchema, {
            nextPageToken: result.nextPageToken,
            totalCount: result.totalCount,
          }),
        });
      },
      saveCustomerSegment: async (request: SaveCustomerSegmentRequest, context: HandlerContext) => {
        const ctx = await this.referenceWriteContext(context);
        if (request.id) uuid(request.id, "id");
        const customerSegment = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.saveCustomerSegment(client, ctx.orgId, request)
        );
        return create(SaveCustomerSegmentResponseSchema, { customerSegment });
      },
      deactivateCustomerSegment: async (
        request: DeactivateCustomerSegmentRequest,
        context: HandlerContext
      ) => {
        const ctx = await this.referenceWriteContext(context);
        const customerSegment = await database.withOrgTransaction(ctx.orgId, (client) =>
          this.references.deactivateCustomerSegment(client, uuid(request.id, "id"))
        );
        return create(DeactivateCustomerSegmentResponseSchema, { customerSegment });
      },
      upsertCanonical: async (request: UpsertCanonicalRequest, context: HandlerContext) => {
        const ctx = requestContext(context);
        const caller = await this.authenticator.authorize(context, ["data_pipeline_svc", "governance_svc"]);
        return create(
          UpsertCanonicalResponseSchema,
          await this.writes.upsertCanonical(ctx.orgId, caller, request)
        );
      },
      applyPriceChanges: async (request: ApplyPriceChangesRequest, context: HandlerContext) => {
        const ctx = requestContext(context);
        const caller = await this.authenticator.authorize(context, ["proposal_svc"]);
        return create(
          ApplyPriceChangesResponseSchema,
          await this.writes.applyPriceChanges(ctx.orgId, caller, request)
        );
      },
    };
  }

  private async readContext(context: HandlerContext) {
    await this.authenticator.authorize(context, READ_CALLERS);
    return requestContext(context);
  }

  private async referenceWriteContext(context: HandlerContext) {
    const caller = await this.authenticator.authorize(context, ["gateway_svc", "governance_svc"]);
    const ctx = requestContext(context);
    if (caller === "gateway_svc") requireOrgAdmin(ctx);
    return ctx;
  }
}
