import type { FastifyInstance } from "fastify";
import {
  ProposalService,
  CreateProposalRequestSchema,
  GetProposalRequestSchema,
  UpdateDraftRequestSchema,
  SubmitProposalRequestSchema,
  ApproveProposalRequestSchema,
  PublishProposalRequestSchema,
  AddCommentRequestSchema,
  ListCommentsRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type ProposalClient = {
  createProposal(req: MessageInitShape<typeof CreateProposalRequestSchema>, opts: Hdr): Promise<object>;
  getProposal(req: MessageInitShape<typeof GetProposalRequestSchema>, opts: Hdr): Promise<object>;
  listProposals(req: { state?: number; actorId?: string; pagination?: { pageSize?: number; pageToken?: string } }, opts: Hdr): Promise<object>;
  updateDraft(req: MessageInitShape<typeof UpdateDraftRequestSchema>, opts: Hdr): Promise<object>;
  submitProposal(req: MessageInitShape<typeof SubmitProposalRequestSchema>, opts: Hdr): Promise<{ violations?: unknown[] }>;
  approveProposal(req: MessageInitShape<typeof ApproveProposalRequestSchema>, opts: Hdr): Promise<object>;
  publishProposal(req: MessageInitShape<typeof PublishProposalRequestSchema>, opts: Hdr): Promise<object>;
  addComment(req: MessageInitShape<typeof AddCommentRequestSchema>, opts: Hdr): Promise<object>;
  listComments(req: MessageInitShape<typeof ListCommentsRequestSchema>, opts: Hdr): Promise<object>;
};

function hdr(req: { ctx: { orgId: string; userId: string } }): Hdr {
  return { headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId } };
}

export async function registerProposalRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(ProposalService, config.proposalServiceUrl) as object as ProposalClient;

  app.post<{ Body: MessageInitShape<typeof CreateProposalRequestSchema> }>("/proposals", async (req, reply) => {
    const result = await client.createProposal(req.body, hdr(req));
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/proposals/:id", async (req, reply) => {
    const result = await client.getProposal({ id: req.params.id }, hdr(req));
    return reply.send(result);
  });

  app.get<{ Querystring: { state?: string; actorId?: string; pageSize?: string; pageToken?: string } }>("/proposals", async (req, reply) => {
    const { state, actorId, pageSize, pageToken } = req.query;
    const result = await client.listProposals({
      state: state ? parseInt(state, 10) : undefined,
      actorId,
      pagination: (pageSize ?? pageToken) ? {
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        pageToken,
      } : undefined,
    }, hdr(req));
    return reply.send(result);
  });

  app.patch<{ Params: { id: string }; Body: MessageInitShape<typeof UpdateDraftRequestSchema> }>("/proposals/:id", async (req, reply) => {
    const result = await client.updateDraft({ id: req.params.id, ...req.body }, hdr(req));
    return reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/proposals/:id/submit", async (req, reply) => {
    const result = await client.submitProposal({ id: req.params.id }, hdr(req));
    if ((result.violations ?? []).length > 0) {
      return reply.code(422).send(result);
    }
    return reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/proposals/:id/approve", async (req, reply) => {
    const result = await client.approveProposal({ id: req.params.id }, hdr(req));
    return reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/proposals/:id/publish", async (req, reply) => {
    const result = await client.publishProposal({ id: req.params.id }, hdr(req));
    return reply.send(result);
  });

  app.post<{ Params: { id: string }; Body: MessageInitShape<typeof AddCommentRequestSchema> }>("/proposals/:id/comments", async (req, reply) => {
    const result = await client.addComment({ proposalId: req.params.id, ...req.body }, hdr(req));
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/proposals/:id/comments", async (req, reply) => {
    const result = await client.listComments({ proposalId: req.params.id }, hdr(req));
    return reply.send(result);
  });
}
