import type { FastifyInstance } from "fastify";
import { GovernanceService } from "@owomide/proto/services/governance/v1/governance_pb.js";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

export async function registerGovernanceRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(GovernanceService, config.governanceServiceUrl);

  app.get("/governance/activity", async (req, reply) => {
    const result = await client.getActivityFeed(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/governance/history/:entityId", async (req, reply) => {
    const { entityId } = req.params as { entityId: string };
    const result = await client.getEntityHistory({ entityId }, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.get("/governance/snapshots", async (req, reply) => {
    const result = await client.listSnapshots(req.query as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });

  app.post("/governance/restore", async (req, reply) => {
    const result = await client.restore(req.body as any, {
      headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId },
    });
    return reply.send(result);
  });
}
