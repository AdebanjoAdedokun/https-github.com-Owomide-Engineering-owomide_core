import type { FastifyInstance } from "fastify";
import {
  ProposalService,
  RequestOverrideRequestSchema,
  ApproveOverrideRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { createServiceClient } from "../clients/factory.js";
import { proposalServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type OverrideClient = {
  requestOverride(req: MessageInitShape<typeof RequestOverrideRequestSchema>, opts: Hdr): Promise<object>;
  approveOverride(req: MessageInitShape<typeof ApproveOverrideRequestSchema>, opts: Hdr): Promise<object>;
};

export interface OverrideRouteDependencies {
  client?: object;
  token?: () => Promise<string>;
}

export async function registerOverrideRequestRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: OverrideRouteDependencies = {}
) {
  const client = (dependencies.client ??
    createServiceClient(ProposalService, config.proposalServiceUrl)) as object as OverrideClient;
  const token = dependencies.token ?? (() => proposalServiceToken(config));
  const headers = async (req: {
    ctx: { orgId: string; userId: string; roles: string[] };
  }): Promise<Hdr> => ({
    headers: {
      authorization: `Bearer ${await token()}`,
      "x-org-id": req.ctx.orgId,
      "x-user-id": req.ctx.userId,
      "x-user-roles": req.ctx.roles.join(","),
    },
  });

  app.post<{ Body: MessageInitShape<typeof RequestOverrideRequestSchema> }>("/override-requests", async (req, reply) => {
    const result = await client.requestOverride(req.body, await headers(req));
    return reply.status(201).send(result);
  });

  app.post<{ Params: { id: string } }>("/override-requests/:id/approve", async (req, reply) => {
    const result = await client.approveOverride({ overrideRequestId: req.params.id }, await headers(req));
    return reply.send(result);
  });
}
