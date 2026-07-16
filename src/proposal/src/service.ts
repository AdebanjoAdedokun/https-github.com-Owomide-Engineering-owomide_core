import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import { create, toBinary } from "@bufbuild/protobuf";
import {
  ProposalService,
  CreateProposalResponseSchema,
  GetProposalResponseSchema,
  UpdateDraftResponseSchema,
  ListProposalsResponseSchema,
  SubmitProposalResponseSchema,
  ApproveProposalResponseSchema,
  PublishProposalResponseSchema,
  type CreateProposalRequest,
  type GetProposalRequest,
  type UpdateDraftRequest,
  type ListProposalsRequest,
  type SubmitProposalRequest,
  type ApproveProposalRequest,
  type PublishProposalRequest,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  ApplyPriceChangesRequestSchema,
  PriceChangeSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { PaginatedResponseSchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  ProposalSubmittedSchema,
  ProposalBlockedSchema,
  ProposalApprovedSchema,
  ProposalPublishedSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import { requestContext, requireApproverRole, ServiceAuthenticator } from "./context.js";
import type { CatalogClient } from "./clients/catalog.js";
import { Database } from "./db.js";
import { dateToTimestamp } from "./domain/time.js";
import { transition, type ProposalState } from "./domain/state-machine.js";
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

function buildPayload(
  nextState: "submitted" | "blocked",
  proposalId: string,
  orgId: string,
  actorId: string,
  changeSetId: string | null
): Uint8Array {
  const createdAt = dateToTimestamp(new Date());
  if (nextState === "blocked") {
    return toBinary(
      ProposalBlockedSchema,
      create(ProposalBlockedSchema, {
        orgId,
        proposalId,
        violations: [],
        actorId,
        createdAt,
      })
    );
  }
  return toBinary(
    ProposalSubmittedSchema,
    create(ProposalSubmittedSchema, {
      orgId,
      proposalId,
      changeSetId: changeSetId ?? "",
      actorId,
      createdAt,
    })
  );
}

export class ProposalServiceImpl {
  readonly implementation: ServiceImpl<typeof ProposalService>;

  constructor(
    private readonly db: Database,
    private readonly authenticator: ServiceAuthenticator,
    private readonly repo: ProposalRepository,
    private readonly catalogClient: CatalogClient
  ) {
    this.implementation = {
      createProposal: this.createProposal.bind(this),
      getProposal: this.getProposal.bind(this),
      listProposals: this.listProposals.bind(this),
      updateDraft: this.updateDraft.bind(this),
      submitProposal: this.submitProposal.bind(this),
      approveProposal: this.approveProposal.bind(this),
      publishProposal: this.publishProposal.bind(this),
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

  private async submitProposal(
    request: SubmitProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    validateUuid(request.id, "id");
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    // Read current state for the state machine guard
    const current = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, request.id)
    );
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    // Margin stub — F4.3 replaces [] with real ValidateBatch results
    const smResult = transition(
      current.row.state as ProposalState,
      { type: "SUBMIT", marginViolations: [] },
      { actorId, proposalActorId: current.row.actor_id }
    );
    if (!smResult.ok) {
      throw new ConnectError(smResult.error.message, Code.FailedPrecondition);
    }

    const { nextState } = smResult;
    const castedNextState = nextState as "submitted" | "blocked";
    const eventType = nextState === "blocked" ? "proposal.blocked" : "proposal.submitted";
    const payload = buildPayload(
      castedNextState,
      request.id,
      current.row.org_id,
      actorId,
      current.row.change_set_id
    );

    // Atomic: state transition + transition log + outbox event in one transaction
    const updated = await this.db.withOrgTransaction(ctx.orgId, async (c) => {
      const result = await this.repo.submitProposal(
        c,
        request.id,
        current.row.state,
        castedNextState,
        actorId,
        {}
      );
      await this.repo.insertOutboxEvent(c, {
        id: crypto.randomUUID(),
        orgId: result.row.org_id,
        eventType,
        aggregateId: request.id,
        partitionKey: request.id,
        payload,
      });
      return result;
    });

    // Blocked means margin violations: return 422 after the DB commits
    if (nextState === "blocked") {
      throw new ConnectError("Proposal blocked: margin violations", Code.FailedPrecondition);
    }

    return create(SubmitProposalResponseSchema, {
      proposal: proposalMessage(updated.row, updated.lines),
      violations: [],
    });
  }

  private async approveProposal(
    request: ApproveProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    validateUuid(request.id, "id");
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    requireApproverRole(ctx);

    const current = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, request.id)
    );
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    const smResult = transition(
      current.row.state as ProposalState,
      { type: "APPROVE" },
      { actorId, proposalActorId: current.row.actor_id }
    );
    if (!smResult.ok) {
      const code =
        smResult.error.code === "SAME_ACTOR_APPROVE"
          ? Code.PermissionDenied
          : Code.FailedPrecondition;
      throw new ConnectError(smResult.error.message, code);
    }

    const payload = toBinary(
      ProposalApprovedSchema,
      create(ProposalApprovedSchema, {
        orgId: ctx.orgId,
        proposalId: request.id,
        approverId: actorId,
        actorId: current.row.actor_id,
        createdAt: dateToTimestamp(new Date()),
      })
    );

    const updated = await this.db.withOrgTransaction(ctx.orgId, async (c) => {
      const result = await this.repo.approveProposal(
        c,
        request.id,
        current.row.state,
        actorId,
        {}
      );
      await this.repo.insertOutboxEvent(c, {
        id: crypto.randomUUID(),
        orgId: ctx.orgId,
        eventType: "proposal.approved",
        aggregateId: request.id,
        partitionKey: request.id,
        payload,
      });
      return result;
    });

    return create(ApproveProposalResponseSchema, {
      proposal: proposalMessage(updated.row, updated.lines),
    });
  }

  private async publishProposal(
    request: PublishProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    validateUuid(request.id, "id");
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    const current = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, request.id)
    );
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    const smResult = transition(
      current.row.state as ProposalState,
      { type: "PUBLISH" },
      { actorId, proposalActorId: current.row.actor_id }
    );
    if (!smResult.ok) {
      throw new ConnectError(smResult.error.message, Code.FailedPrecondition);
    }

    const now = new Date();
    const effectiveAt = dateToTimestamp(now);

    const changes = current.lines.map((line) =>
      create(PriceChangeSchema, {
        proposalLineId: line.id,
        skuId: line.sku_id,
        channelId: line.channel_id,
        newPrice: {
          amount: BigInt(line.proposed_price_minor),
          currency: line.proposed_price_currency,
        },
        effectiveAt,
      })
    );

    await this.catalogClient.applyPriceChanges(
      create(ApplyPriceChangesRequestSchema, {
        idempotencyKey: request.id,
        proposalId: request.id,
        actorId,
        changes,
      })
    );

    const payload = toBinary(
      ProposalPublishedSchema,
      create(ProposalPublishedSchema, {
        orgId: ctx.orgId,
        proposalId: request.id,
        actorId,
        effectiveAt,
        createdAt: dateToTimestamp(now),
      })
    );

    const updated = await this.db.withOrgTransaction(ctx.orgId, async (c) => {
      const result = await this.repo.publishProposal(
        c,
        request.id,
        current.row.state,
        actorId,
        {}
      );
      await this.repo.insertOutboxEvent(c, {
        id: crypto.randomUUID(),
        orgId: ctx.orgId,
        eventType: "proposal.published",
        aggregateId: request.id,
        partitionKey: request.id,
        payload,
      });
      return result;
    });

    return create(PublishProposalResponseSchema, {
      proposal: proposalMessage(updated.row, updated.lines),
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
