import type { FastifyInstance } from "fastify";
import {
  ProposalService,
  RequestOverrideRequestSchema,
  ApproveOverrideRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type OverrideClient = {
  requestOverride(req: MessageInitShape<typeof RequestOverrideRequestSchema>, opts: Hdr): Promise<object>;
  approveOverride(req: MessageInitShape<typeof ApproveOverrideRequestSchema>, opts: Hdr): Promise<object>;
};

function hdr(req: { ctx: { orgId: string; userId: string } }): Hdr {
  return { headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId } };
}

export async function registerOverrideRequestRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(ProposalService, config.proposalServiceUrl) as object as OverrideClient;

  app.post<{ Body: MessageInitShape<typeof RequestOverrideRequestSchema> }>("/override-requests", async (req, reply) => {
    const result = await client.requestOverride(req.body, hdr(req));
    return reply.status(201).send(result);
  });

  app.post<{ Params: { id: string } }>("/override-requests/:id/approve", async (req, reply) => {
    const result = await client.approveOverride({ overrideRequestId: req.params.id }, hdr(req));
    return reply.send(result);
  });
}
