import type { FastifyInstance } from "fastify";
import { ProposalService } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerChangeSetRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(ProposalService, config.proposalServiceUrl);

  app.post("/change-sets/scope", async (req, reply) => {
    const result = await client.buildScope(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.status(201).send(result);
  });

  app.post("/change-sets/preview", async (req, reply) => {
    const result = await client.previewChangeSet(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/change-sets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getChangeSet({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/change-sets", async (req, reply) => {
    const result = await client.listChangeSets(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.patch("/change-sets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.updateChangeSet({ id, ...(req.body as any) }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/change-sets/:id/submit", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.submitChangeSet({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.delete("/change-sets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.discardChangeSet({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/change-sets/:id/schedule", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.scheduleRollout({ id, ...(req.body as any) }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
