import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
  ProposalService,
  CreateProposalResponseSchema,
  GetProposalResponseSchema,
  UpdateDraftResponseSchema,
  ListProposalsResponseSchema,
  type CreateProposalRequest,
  type GetProposalRequest,
  type UpdateDraftRequest,
  type ListProposalsRequest,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { PaginatedResponseSchema } from "@owomide/proto/common/v1/common_pb.js";
import { requestContext, ServiceAuthenticator } from "./context.js";
import { Database } from "./db.js";
import { proposalMessage } from "./repo/mappers.js";
import { ProposalRepository } from "./repo/proposal-repository.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw new ConnectError(`${field} must be a valid UUID`, Code.InvalidArgument);
  }
  return value;
}

function notImplemented(): never {
  throw new ConnectError("Not implemented", Code.Unimplemented);
}

export class ProposalServiceImpl {
  readonly implementation: ServiceImpl<typeof ProposalService>;

  constructor(
    private readonly db: Database,
    private readonly authenticator: ServiceAuthenticator,
    private readonly repo: ProposalRepository
  ) {
    this.implementation = {
      createProposal: this.createProposal.bind(this),
      getProposal: this.getProposal.bind(this),
      listProposals: this.listProposals.bind(this),
      updateDraft: this.updateDraft.bind(this),
      submitProposal: notImplemented,
      approveProposal: notImplemented,
      publishProposal: notImplemented,
      requestOverride: notImplemented,
      approveOverride: notImplemented,
      buildScope: notImplemented,
      previewChangeSet: notImplemented,
      getChangeSet: notImplemented,
      listChangeSets: notImplemented,
      updateChangeSet: notImplemented,
      submitChangeSet: notImplemented,
      discardChangeSet: notImplemented,
      scheduleRollout: notImplemented,
    };
  }

  private async createProposal(
    request: CreateProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    if (!request.title.trim()) {
      throw new ConnectError("title is required", Code.InvalidArgument);
    }
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }
    const result = await this.db.withOrgTransaction(ctx.orgId, (client) =>
      this.repo.createProposal(client, ctx.orgId, actorId, request)
    );
    return create(CreateProposalResponseSchema, {
      proposal: proposalMessage(result.row, result.lines),
    });
  }

  private async getProposal(
    request: GetProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    validateUuid(request.id, "id");
    const result = await this.db.withOrgTransaction(ctx.orgId, (client) =>
      this.repo.getProposal(client, request.id)
    );
    if (!result) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }
    return create(GetProposalResponseSchema, {
      proposal: proposalMessage(result.row, result.lines),
    });
  }

  private async updateDraft(
    request: UpdateDraftRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    validateUuid(request.id, "id");
    if (!request.title.trim()) {
      throw new ConnectError("title is required", Code.InvalidArgument);
    }
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }
    const result = await this.db.withOrgTransaction(ctx.orgId, (client) =>
      this.repo.updateDraft(client, request.id, request)
    );
    return create(UpdateDraftResponseSchema, {
      proposal: proposalMessage(result.row, result.lines),
    });
  }

  private async listProposals(
    request: ListProposalsRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    const result = await this.db.withOrgTransaction(ctx.orgId, (client) =>
      this.repo.listProposals(client, request)
    );
    return create(ListProposalsResponseSchema, {
      proposals: result.proposals.map((p) => proposalMessage(p.row, p.lines)),
      pagination: create(PaginatedResponseSchema, {
        nextPageToken: result.nextPageToken,
        totalCount: result.totalCount,
      }),
    });
  }
}
