import type { FastifyInstance } from "fastify";
import type { MessageInitShape } from "@bufbuild/protobuf";
import {
  BatchGetCostsRequestSchema,
  BatchGetPricesRequestSchema,
  BatchGetProductsRequestSchema,
  CatalogService,
  ListChannelsRequestSchema,
  ListCustomerSegmentsRequestSchema,
  ListLocationsRequestSchema,
  ListSkusRequestSchema,
  SaveChannelRequestSchema,
  SaveCustomerSegmentRequestSchema,
  SaveLocationRequestSchema,
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

export async function registerCatalogRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(CatalogService, config.catalogServiceUrl);
  const headers = async (req: { ctx: { orgId: string; userId: string; roles: string[] } }) => ({
    authorization: `Bearer ${await catalogServiceToken(config)}`,
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
    return reply.send(result);
  });

  app.get("/catalog/products", async (req, reply) => {
    const result = await client.batchGetProducts(req.query as BatchGetProductsInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.get("/catalog/skus/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getSku(
      { id },
      {
        headers: await headers(req),
      }
    );
    return reply.send(result);
  });

  app.get("/catalog/skus", async (req, reply) => {
    const result = await client.listSkus(req.query as ListSkusInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.get("/catalog/costs", async (req, reply) => {
    const result = await client.batchGetCosts(req.query as BatchGetCostsInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.get("/catalog/prices", async (req, reply) => {
    const result = await client.batchGetPrices(req.query as BatchGetPricesInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.get("/catalog/channels", async (req, reply) => {
    const result = await client.listChannels(req.query as ListChannelsInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.get("/catalog/locations", async (req, reply) => {
    const result = await client.listLocations(req.query as ListLocationsInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.post("/catalog/channels", async (req, reply) => {
    const result = await client.saveChannel(req.body as SaveChannelInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(result);
  });

  app.put("/catalog/channels/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveChannel(
      { ...(req.body as SaveChannelInput), id },
      { headers: await headers(req) }
    );
    return reply.send(result);
  });

  app.delete("/catalog/channels/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateChannel({ id }, { headers: await headers(req) });
    return reply.send(result);
  });

  app.post("/catalog/locations", async (req, reply) => {
    const result = await client.saveLocation(req.body as SaveLocationInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(result);
  });

  app.put("/catalog/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveLocation(
      { ...(req.body as SaveLocationInput), id },
      { headers: await headers(req) }
    );
    return reply.send(result);
  });

  app.delete("/catalog/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateLocation({ id }, { headers: await headers(req) });
    return reply.send(result);
  });

  app.get("/catalog/customer-segments", async (req, reply) => {
    const result = await client.listCustomerSegments(req.query as ListCustomerSegmentsInput, {
      headers: await headers(req),
    });
    return reply.send(result);
  });

  app.post("/catalog/customer-segments", async (req, reply) => {
    const result = await client.saveCustomerSegment(req.body as SaveCustomerSegmentInput, {
      headers: await headers(req),
    });
    return reply.status(201).send(result);
  });

  app.put("/catalog/customer-segments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.saveCustomerSegment(
      { ...(req.body as SaveCustomerSegmentInput), id },
      { headers: await headers(req) }
    );
    return reply.send(result);
  });

  app.delete("/catalog/customer-segments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateCustomerSegment({ id }, { headers: await headers(req) });
    return reply.send(result);
  });
}
