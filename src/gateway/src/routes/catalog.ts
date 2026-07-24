import type { FastifyInstance } from "fastify";
import { toJson, type MessageInitShape } from "@bufbuild/protobuf";
import {
  BatchGetCostsRequestSchema,
  BatchGetCostsResponseSchema,
  BatchGetPricesRequestSchema,
  BatchGetPricesResponseSchema,
  BatchGetProductsRequestSchema,
  BatchGetProductsResponseSchema,
  CatalogService,
  DeactivateChannelResponseSchema,
  DeactivateCustomerSegmentResponseSchema,
  DeactivateLocationResponseSchema,
  GetProductResponseSchema,
  GetSkuResponseSchema,
  ListChannelsRequestSchema,
  ListChannelsResponseSchema,
  ListCustomerSegmentsRequestSchema,
  ListCustomerSegmentsResponseSchema,
  ListLocationsRequestSchema,
  ListLocationsResponseSchema,
  ListSkusRequestSchema,
  ListSkusResponseSchema,
  SaveChannelRequestSchema,
  SaveChannelResponseSchema,
  SaveCustomerSegmentRequestSchema,
  SaveCustomerSegmentResponseSchema,
  SaveLocationRequestSchema,
  SaveLocationResponseSchema,
  type BatchGetCostsResponse,
  type BatchGetPricesResponse,
  type BatchGetProductsResponse,
  type DeactivateChannelResponse,
  type DeactivateCustomerSegmentResponse,
  type DeactivateLocationResponse,
  type GetProductResponse,
  type GetSkuResponse,
  type ListChannelsResponse,
  type ListCustomerSegmentsResponse,
  type ListLocationsResponse,
  type ListSkusResponse,
  type SaveChannelResponse,
  type SaveCustomerSegmentResponse,
  type SaveLocationResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { createServiceClient } from "../clients/factory.js";
import { catalogServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

type BatchGetProductsInput = MessageInitShape<typeof BatchGetProductsRequestSchema>;
type ListSkusInput = MessageInitShape<typeof ListSkusRequestSchema>;
type BatchGetCostsInput = MessageInitShape<typeof BatchGetCostsRequestSchema>;
type BatchGetPricesInput = MessageInitShape<typeof BatchGetPricesRequestSchema>;
type ListChannelsInput = MessageInitShape<typeof ListChannelsRequestSchema>;
type ListLocationsInput = MessageInitShape<typeof ListLocationsRequestSchema>;
type ListCustomerSegmentsInput = MessageInitShape<typeof ListCustomerSegmentsRequestSchema>;
type SaveChannelInput = MessageInitShape<typeof SaveChannelRequestSchema>;
type SaveLocationInput = MessageInitShape<typeof SaveLocationRequestSchema>;
type SaveCustomerSegmentInput = MessageInitShape<typeof SaveCustomerSegmentRequestSchema>;

// Hand-rolled typed interface — Client<typeof CatalogService> produces unresolvable
// conditional types under strict mode due to mixed method kinds in the service descriptor.
interface CatalogClient {
  getProduct(req: { id: string }, opts: { headers: Record<string, string> }): Promise<GetProductResponse>;
  batchGetProducts(req: object, opts: { headers: Record<string, string> }): Promise<BatchGetProductsResponse>;
  getSku(req: { id: string }, opts: { headers: Record<string, string> }): Promise<GetSkuResponse>;
  listSkus(req: object, opts: { headers: Record<string, string> }): Promise<ListSkusResponse>;
  batchGetCosts(req: object, opts: { headers: Record<string, string> }): Promise<BatchGetCostsResponse>;
  batchGetPrices(req: object, opts: { headers: Record<string, string> }): Promise<BatchGetPricesResponse>;
  listChannels(req: object, opts: { headers: Record<string, string> }): Promise<ListChannelsResponse>;
  listLocations(req: object, opts: { headers: Record<string, string> }): Promise<ListLocationsResponse>;
  listCustomerSegments(req: object, opts: { headers: Record<string, string> }): Promise<ListCustomerSegmentsResponse>;
  saveChannel(req: object, opts: { headers: Record<string, string> }): Promise<SaveChannelResponse>;
  deactivateChannel(req: { id: string }, opts: { headers: Record<string, string> }): Promise<DeactivateChannelResponse>;
  saveLocation(req: object, opts: { headers: Record<string, string> }): Promise<SaveLocationResponse>;
  deactivateLocation(req: { id: string }, opts: { headers: Record<string, string> }): Promise<DeactivateLocationResponse>;
  saveCustomerSegment(req: object, opts: { headers: Record<string, string> }): Promise<SaveCustomerSegmentResponse>;
  deactivateCustomerSegment(req: { id: string }, opts: { headers: Record<string, string> }): Promise<DeactivateCustomerSegmentResponse>;
}

export interface CatalogRouteDependencies {
  client?: object;
  token?: () => Promise<string>;
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: CatalogRouteDependencies = {}
) {
  const client = (
    dependencies.client ?? createServiceClient(CatalogService, config.catalogServiceUrl)
  ) as object as CatalogClient;
  const token = dependencies.token ?? (() => catalogServiceToken(config));
  const headers = async (req: { ctx: { orgId: string; userId: string; roles: string[] } }) => ({
    authorization: `Bearer ${await token()}`,
    "x-org-id": req.ctx.orgId,
    "x-user-id": req.ctx.userId,
    "x-user-roles": req.ctx.roles.join(","),
  });

  app.get("/catalog/products/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getProduct(
      { id },
      {
        headers: await headers(req),
      }
    );
    return reply.send(toJson(GetProductResponseSchema, result));
  });

  app.get("/catalog/products", async (req, reply) => {
    const result = await client.batchGetProducts(req.query as BatchGetProductsInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(BatchGetProductsResponseSchema, result));
  });

  app.get("/catalog/skus/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getSku(
      { id },
      {
        headers: await headers(req),
      }
    );
    return reply.send(toJson(GetSkuResponseSchema, result));
  });

  app.get("/catalog/skus", async (req, reply) => {
    const result = await client.listSkus(req.query as ListSkusInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(ListSkusResponseSchema, result));
  });

  app.get("/catalog/costs", async (req, reply) => {
    const result = await client.batchGetCosts(req.query as BatchGetCostsInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(BatchGetCostsResponseSchema, result));
  });

  app.get("/catalog/prices", async (req, reply) => {
    const result = await client.batchGetPrices(req.query as BatchGetPricesInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(BatchGetPricesResponseSchema, result));
  });

  app.get("/catalog/channels", async (req, reply) => {
    const result = await client.listChannels(req.query as ListChannelsInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(ListChannelsResponseSchema, result));
  });

  app.get("/catalog/locations", async (req, reply) => {
    const result = await client.listLocations(req.query as ListLocationsInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(ListLocationsResponseSchema, result));
  });

  app.post("/catalog/channels", async (req, reply) => {
    const result = await client.saveChannel(req.body as SaveChannelInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(toJson(SaveChannelResponseSchema, result));
  });

  app.put("/catalog/channels/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveChannel(
      { ...(req.body as SaveChannelInput), id },
      { headers: await headers(req) }
    );
    return reply.send(toJson(SaveChannelResponseSchema, result));
  });

  app.delete("/catalog/channels/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateChannel({ id }, { headers: await headers(req) });
    return reply.send(toJson(DeactivateChannelResponseSchema, result));
  });

  app.post("/catalog/locations", async (req, reply) => {
    const result = await client.saveLocation(req.body as SaveLocationInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(toJson(SaveLocationResponseSchema, result));
  });

  app.put("/catalog/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveLocation(
      { ...(req.body as SaveLocationInput), id },
      { headers: await headers(req) }
    );
    return reply.send(toJson(SaveLocationResponseSchema, result));
  });

  app.delete("/catalog/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateLocation({ id }, { headers: await headers(req) });
    return reply.send(toJson(DeactivateLocationResponseSchema, result));
  });

  app.get("/catalog/customer-segments", async (req, reply) => {
    const result = await client.listCustomerSegments(req.query as ListCustomerSegmentsInput, {
      headers: await headers(req),
    });
    return reply.send(toJson(ListCustomerSegmentsResponseSchema, result));
  });

  app.post("/catalog/customer-segments", async (req, reply) => {
    const result = await client.saveCustomerSegment(req.body as SaveCustomerSegmentInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(toJson(SaveCustomerSegmentResponseSchema, result));
  });

  app.put("/catalog/customer-segments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveCustomerSegment(
      { ...(req.body as SaveCustomerSegmentInput), id },
      { headers: await headers(req) }
    );
    return reply.send(toJson(SaveCustomerSegmentResponseSchema, result));
  });

  app.delete("/catalog/customer-segments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateCustomerSegment({ id }, { headers: await headers(req) });
    return reply.send(toJson(DeactivateCustomerSegmentResponseSchema, result));
  });
}
