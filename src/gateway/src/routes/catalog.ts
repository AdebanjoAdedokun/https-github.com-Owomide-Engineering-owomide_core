import type { FastifyInstance } from "fastify";
import { CatalogService } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerCatalogRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(CatalogService, config.catalogServiceUrl);

  app.get("/catalog/products/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getProduct({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/products", async (req, reply) => {
    const result = await client.batchGetProducts(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/skus/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getSku({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/skus", async (req, reply) => {
    const result = await client.listSkus(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/costs", async (req, reply) => {
    const result = await client.batchGetCosts(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/prices", async (req, reply) => {
    const result = await client.batchGetPrices(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/channels", async (req, reply) => {
    const result = await client.listChannels(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/catalog/locations", async (req, reply) => {
    const result = await client.listLocations(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
