import type { FastifyInstance } from "fastify";
import { ProposalService } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerProposalRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(ProposalService, config.proposalServiceUrl);

  app.post("/proposals", async (req, reply) => {
    const result = await client.createProposal(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.status(201).send(result);
  });

  app.get("/proposals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.getProposal({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/proposals", async (req, reply) => {
    const result = await client.listProposals(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.patch("/proposals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.updateDraft({ id, ...(req.body as any) }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/proposals/:id/submit", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.submitProposal({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/proposals/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.approveProposal({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/proposals/:id/publish", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await client.publishProposal({ id }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
