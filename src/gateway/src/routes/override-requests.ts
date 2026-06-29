import type { FastifyInstance } from "fastify";
import { ProposalService } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerOverrideRequestRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(ProposalService, config.proposalServiceUrl);

  app.post("/override-requests", async (req, reply) => {
    const result = await client.requestOverride(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.status(201).send(result);
  });

  app.post("/override-requests/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.approveOverride({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
