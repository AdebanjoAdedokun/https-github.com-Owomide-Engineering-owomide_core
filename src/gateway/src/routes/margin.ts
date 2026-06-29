import type { FastifyInstance } from "fastify";
import { MarginService } from "@owomide/proto/services/margin/v1/margin_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerMarginRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(MarginService, config.marginServiceUrl);

  app.post("/margin/validate", async (req, reply) => {
    const result = await client.validateBatch(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/margin/rules", async (req, reply) => {
    const result = await client.listRules(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.put("/margin/rules", async (req, reply) => {
    const result = await client.upsertRule(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.delete("/margin/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.deactivateRule({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
