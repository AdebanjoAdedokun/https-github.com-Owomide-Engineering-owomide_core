import type { FastifyInstance } from "fastify";
import {
  ProposalService,
  BuildScopeRequestSchema,
  PreviewChangeSetRequestSchema,
  GetChangeSetRequestSchema,
  ListChangeSetsRequestSchema,
  UpdateChangeSetRequestSchema,
  SubmitChangeSetRequestSchema,
  DiscardChangeSetRequestSchema,
  ScheduleRolloutRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createServiceClient } from "../clients/factory.js";
import { proposalServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type ChangeSetClient = {
  buildScope(req: MessageInitShape<typeof BuildScopeRequestSchema>, opts: Hdr): Promise<object>;
  previewChangeSet(req: MessageInitShape<typeof PreviewChangeSetRequestSchema>, opts: Hdr): Promise<object>;
  getChangeSet(req: MessageInitShape<typeof GetChangeSetRequestSchema>, opts: Hdr): Promise<object>;
  listChangeSets(req: MessageInitShape<typeof ListChangeSetsRequestSchema>, opts: Hdr): Promise<object>;
  updateChangeSet(req: MessageInitShape<typeof UpdateChangeSetRequestSchema>, opts: Hdr): Promise<object>;
  submitChangeSet(req: MessageInitShape<typeof SubmitChangeSetRequestSchema>, opts: Hdr): Promise<object>;
  discardChangeSet(req: MessageInitShape<typeof DiscardChangeSetRequestSchema>, opts: Hdr): Promise<object>;
  scheduleRollout(req: MessageInitShape<typeof ScheduleRolloutRequestSchema>, opts: Hdr): Promise<object>;
};

export interface ChangeSetRouteDependencies {
  client?: object;
  token?: () => Promise<string>;
}

export async function registerChangeSetRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: ChangeSetRouteDependencies = {}
) {
  const client = (dependencies.client ??
    createServiceClient(ProposalService, config.proposalServiceUrl)) as object as ChangeSetClient;
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

  app.post<{ Body: MessageInitShape<typeof BuildScopeRequestSchema> }>("/change-sets/scope", async (req, reply) => {
    const result = await client.buildScope(req.body, await headers(req));
    return reply.status(201).send(result);
  });

  app.post<{ Body: MessageInitShape<typeof PreviewChangeSetRequestSchema> }>("/change-sets/preview", async (req, reply) => {
    const result = await client.previewChangeSet(req.body, await headers(req));
    return reply.send(result);
  });

  app.get<{ Params: { id: string } }>("/change-sets/:id", async (req, reply) => {
    const result = await client.getChangeSet({ id: req.params.id }, await headers(req));
    return reply.send(result);
  });

  app.get<{ Querystring: { pageSize?: string; pageToken?: string } }>("/change-sets", async (req, reply) => {
    const { pageSize, pageToken } = req.query;
    const result = await client.listChangeSets({
      pagination: (pageSize ?? pageToken) ? {
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        pageToken,
      } : undefined,
    }, await headers(req));
    return reply.send(result);
  });

  app.patch<{ Params: { id: string }; Body: MessageInitShape<typeof UpdateChangeSetRequestSchema> }>("/change-sets/:id", async (req, reply) => {
    const result = await client.updateChangeSet({ id: req.params.id, ...req.body }, await headers(req));
    return reply.send(result);
  });

  app.post<{ Params: { id: string }; Body: { title?: string } }>("/change-sets/:id/submit", async (req, reply) => {
    const result = await client.submitChangeSet({ id: req.params.id, title: req.body.title }, await headers(req));
    return reply.send(result);
  });

  app.delete<{ Params: { id: string } }>("/change-sets/:id", async (req, reply) => {
    const result = await client.discardChangeSet({ id: req.params.id }, await headers(req));
    return reply.send(result);
  });

  app.post<{ Params: { id: string }; Body: { effectiveAt: string } }>("/change-sets/:id/schedule", async (req, reply) => {
    const result = await client.scheduleRollout({
      proposalId: req.params.id,
      effectiveAt: timestampFromDate(new Date(req.body.effectiveAt)),
    }, await headers(req));
    return reply.send(result);
  });
}
