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
  AddCommentResponseSchema,
  ListCommentsResponseSchema,
  RequestOverrideResponseSchema,
  ApproveOverrideResponseSchema,
  GetChangeSetResponseSchema,
  ListChangeSetsResponseSchema,
  UpdateChangeSetResponseSchema,
  DiscardChangeSetResponseSchema,
  BuildScopeResponseSchema,
  ScopedSkuSchema,
  type CreateProposalRequest,
  type GetProposalRequest,
  type UpdateDraftRequest,
  type ListProposalsRequest,
  type SubmitProposalRequest,
  type ApproveProposalRequest,
  type PublishProposalRequest,
  type AddCommentRequest,
  type ListCommentsRequest,
  type RequestOverrideRequest,
  type ApproveOverrideRequest,
  type GetChangeSetRequest,
  type ListChangeSetsRequest,
  type UpdateChangeSetRequest,
  type DiscardChangeSetRequest,
  type BuildScopeRequest,
  PreviewChangeSetResponseSchema,
  type PreviewChangeSetRequest,
  SubmitChangeSetResponseSchema,
  type SubmitChangeSetRequest,
  ScheduleRolloutResponseSchema,
  type ScheduleRolloutRequest,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  ApplyPriceChangesRequestSchema,
  PriceChangeSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import {
  ValidateBatchRequestSchema,
  ValidateItemSchema,
  type Violation,
  ViolationSeverity,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import { MoneySchema, PaginatedResponseSchema } from "@owomide/proto/common/v1/common_pb.js";
import {
  ProposalSubmittedSchema,
  ProposalBlockedSchema,
  ProposalApprovedSchema,
  ProposalPublishedSchema,
  ViolationSchema as EventViolationSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  OverrideRequestedSchema,
  OverrideApprovedSchema,
} from "@owomide/proto/events/override/v1_pb.js";
import {
  requestContext,
  requirePermission,
  signServiceJwt,
  ServiceAuthenticator,
  type RequestContext,
} from "./context.js";
import type { RbacClient } from "./clients/rbac.js";
import { Permission } from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import { resolveScope } from "./domain/resolve-scope.js";
import { parseScopeDsl } from "./domain/scope-dsl.js";
import { requireCompletePriceApplication } from "./domain/catalog-completion.js";
import { parseRepricingRule, applyRule } from "./domain/repricing-rules.js";
import { computeDiff } from "./domain/diff.js";
import type { CatalogClient } from "./clients/catalog.js";
import type { MarginClient } from "./clients/margin.js";
import type { MarginViolation } from "./domain/state-machine.js";
import { Database } from "./db.js";
import { dateToTimestamp, timestampToDate } from "./domain/time.js";
import { transition, type ProposalState } from "./domain/state-machine.js";
import { changeSetMessage, commentMessage, overrideRequestMessage, proposalMessage, type ProposalLineRow } from "./repo/mappers.js";
import { ProposalRepository } from "./repo/proposal-repository.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw new ConnectError(`${field} must be a valid UUID`, Code.InvalidArgument);
  }
  return value;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

function buildPayload(
  nextState: "submitted" | "blocked",
  proposalId: string,
  orgId: string,
  actorId: string,
  changeSetId: string | null,
  rawViolations: Violation[] = [],
  lines: ProposalLineRow[] = [],
): Uint8Array {
  const createdAt = dateToTimestamp(new Date());
  if (nextState === "blocked") {
    // channelId is omitted: Margin's Violation has no channel_id field so attribution
    // cannot be reliable when the same SKU appears in multiple channels. Consumers
    // should use skuId + ruleId as the unique violation key.
    const skuToLines = new Map<string, string[]>();
    for (const l of lines) {
      const existing = skuToLines.get(l.sku_id);
      if (existing) existing.push(l.channel_id);
      else skuToLines.set(l.sku_id, [l.channel_id]);
    }
    const eventViolations = rawViolations.map((v) => {
      const channels = skuToLines.get(v.skuId) ?? [];
      return create(EventViolationSchema, {
        skuId: v.skuId,
        channelId: channels.length === 1 ? (channels[0] ?? "") : "",
        ruleId: v.ruleId,
        message: v.message,
        proposedPrice: v.proposed,
        floorPrice: v.floor,
      });
    });
    return toBinary(
      ProposalBlockedSchema,
      create(ProposalBlockedSchema, {
        orgId,
        proposalId,
        violations: eventViolations,
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
    private readonly catalogClient: CatalogClient,
    private readonly marginClient: MarginClient,
    private readonly opts: {
      serviceJwtIssuer: string;
      catalogServiceSecret: string;
      marginServiceSecret: string;
      rbacServiceSecret?: string;
    } = { serviceJwtIssuer: "", catalogServiceSecret: "", marginServiceSecret: "" },
    private readonly rbacClient?: RbacClient
  ) {
    this.implementation = {
      createProposal: this.createProposal.bind(this),
      getProposal: this.getProposal.bind(this),
      listProposals: this.listProposals.bind(this),
      updateDraft: this.updateDraft.bind(this),
      submitProposal: this.submitProposal.bind(this),
      approveProposal: this.approveProposal.bind(this),
      publishProposal: this.publishProposal.bind(this),
      addComment: this.addComment.bind(this),
      listComments: this.listComments.bind(this),
      requestOverride: this.requestOverride.bind(this),
      approveOverride: this.approveOverride.bind(this),
      buildScope: this.buildScope.bind(this),
      previewChangeSet: this.previewChangeSet.bind(this),
      getChangeSet: this.getChangeSet.bind(this),
      listChangeSets: this.listChangeSets.bind(this),
      updateChangeSet: this.updateChangeSet.bind(this),
      submitChangeSet: this.submitChangeSet.bind(this),
      discardChangeSet: this.discardChangeSet.bind(this),
      scheduleRollout: this.scheduleRollout.bind(this),
    };
  }

  /**
   * Gate a handler on an RBAC permission via a live CheckPermission call to
   * the rbac service. A no-op when no rbac client is configured (local dev
   * without the RBAC stack), mirroring how margin/catalog auth is skipped
   * when the corresponding service secret is unset.
   */
  private async enforce(ctx: RequestContext, permission: Permission): Promise<void> {
    if (!this.rbacClient) return;
    const headers = new Headers();
    headers.set("x-org-id", ctx.orgId);
    headers.set("x-user-roles", ctx.roles.join(","));
    if (ctx.userId) headers.set("x-user-id", ctx.userId);
    if (this.opts.rbacServiceSecret) {
      const jwt = await signServiceJwt(
        "proposal_svc",
        "rbac",
        this.opts.rbacServiceSecret,
        this.opts.serviceJwtIssuer
      );
      headers.set("Authorization", `Bearer ${jwt}`);
    }
    await requirePermission(this.rbacClient, headers, ctx, permission);
  }

  private async createProposal(
    request: CreateProposalRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_CREATE_DRAFT);
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
    await this.enforce(ctx, Permission.PROPOSAL_READ);
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
    await this.enforce(ctx, Permission.PROPOSAL_EDIT_DRAFT);
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
    await this.enforce(ctx, Permission.PROPOSAL_SUBMIT);
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

    // Call Margin.ValidateBatch with all proposal lines (batched — never per-line)
    const marginItems = current.lines.map((line) =>
      create(ValidateItemSchema, {
        skuId: line.sku_id,
        channelId: line.channel_id,
        proposedPrice: create(MoneySchema, {
          amount: BigInt(line.proposed_price_minor),
          currency: line.proposed_price_currency,
        }),
      })
    );

    let rawViolations: Violation[] = [];
    let marginViolations: MarginViolation[] = [];

    if (marginItems.length > 0) {
      const marginHeaders = new Headers();
      marginHeaders.set("x-org-id", ctx.orgId);
      if (this.opts.marginServiceSecret) {
        const jwt = await signServiceJwt(
          "proposal_svc",
          "margin",
          this.opts.marginServiceSecret,
          this.opts.serviceJwtIssuer
        );
        marginHeaders.set("Authorization", `Bearer ${jwt}`);
      }
      let marginResp;
      try {
        marginResp = await this.marginClient.validateBatch(
          create(ValidateBatchRequestSchema, { items: marginItems }),
          marginHeaders
        );
      } catch {
        // Re-throw as Internal so callers never see Margin hostnames or stack traces.
        throw new ConnectError("margin validation unavailable", Code.Internal);
      }
      rawViolations = marginResp.violations;
      marginViolations = rawViolations.map((v) => ({
        skuId: v.skuId,
        code: v.severity === ViolationSeverity.WARN ? "WARN" : "BLOCK",
        message: v.message,
      }));
    }

    const smResult = transition(
      current.row.state as ProposalState,
      { type: "SUBMIT", marginViolations },
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
      current.row.change_set_id,
      rawViolations,
      current.lines
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

    // Return violations in response; gateway maps non-empty violations to 422.
    return create(SubmitProposalResponseSchema, {
      proposal: proposalMessage(updated.row, updated.lines),
      violations: rawViolations,
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

    await this.enforce(ctx, Permission.APPROVAL_APPROVE);

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
    await this.enforce(ctx, Permission.EXECUTION_MARK_IMPLEMENTED);
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

    const catalogHeaders = new Headers();
    catalogHeaders.set("x-org-id", ctx.orgId);
    if (this.opts.catalogServiceSecret) {
      const jwt = await signServiceJwt(
        "proposal_svc",
        "catalog",
        this.opts.catalogServiceSecret,
        this.opts.serviceJwtIssuer
      );
      catalogHeaders.set("Authorization", `Bearer ${jwt}`);
    }

    const application = await this.catalogClient.applyPriceChanges(
      create(ApplyPriceChangesRequestSchema, {
        idempotencyKey: request.id,
        proposalId: request.id,
        actorId,
        changes,
      }),
      catalogHeaders
    );
    requireCompletePriceApplication(changes, application);

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

  private async addComment(
    request: AddCommentRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.COMMENT_CREATE);
    validateUuid(request.proposalId, "proposal_id");
    if (!request.body.trim()) {
      throw new ConnectError("body is required", Code.InvalidArgument);
    }
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    const existing = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, request.proposalId)
    );
    if (!existing) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    const comment = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.addComment(c, request.proposalId, ctx.orgId, actorId, request.body)
    );

    return create(AddCommentResponseSchema, {
      comment: commentMessage(comment),
    });
  }

  private async listComments(
    request: ListCommentsRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_READ);
    validateUuid(request.proposalId, "proposal_id");

    const result = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.listComments(c, request.proposalId, request)
    );

    return create(ListCommentsResponseSchema, {
      comments: result.comments.map(commentMessage),
      pagination: create(PaginatedResponseSchema, {
        nextPageToken: result.nextPageToken,
        totalCount: result.totalCount,
      }),
    });
  }

  private async requestOverride(
    request: RequestOverrideRequest,
    context: HandlerContext,
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.OVERRIDE_REQUEST);
    validateUuid(request.proposalId, "proposal_id");
    if (!request.justification.trim()) {
      throw new ConnectError("justification is required", Code.InvalidArgument);
    }
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    const current = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, request.proposalId)
    );
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    const smResult = transition(
      current.row.state as ProposalState,
      { type: "REQUEST_OVERRIDE" },
      { actorId, proposalActorId: current.row.actor_id },
    );
    if (!smResult.ok) {
      throw new ConnectError(smResult.error.message, Code.FailedPrecondition);
    }

    const now = new Date();

    const overrideRow = await this.db.withOrgTransaction(ctx.orgId, async (c) => {
      const row = await this.repo.createOverrideRequest(
        c,
        ctx.orgId,
        request.proposalId,
        actorId,
        request.justification,
      );

      const payload = toBinary(
        OverrideRequestedSchema,
        create(OverrideRequestedSchema, {
          orgId: ctx.orgId,
          proposalId: request.proposalId,
          overrideRequestId: row.id,
          actorId,
          justification: request.justification,
          createdAt: dateToTimestamp(now),
        }),
      );

      await this.repo.insertOutboxEvent(c, {
        id: crypto.randomUUID(),
        orgId: ctx.orgId,
        eventType: "override.requested",
        aggregateId: request.proposalId,
        partitionKey: request.proposalId,
        payload,
      });

      return row;
    });

    return create(RequestOverrideResponseSchema, {
      overrideRequest: overrideRequestMessage(overrideRow),
    });
  }

  private async approveOverride(
    request: ApproveOverrideRequest,
    context: HandlerContext,
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.OVERRIDE_APPROVE);
    validateUuid(request.overrideRequestId, "override_request_id");
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }

    const overrideRow = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getOverrideRequest(c, ctx.orgId, request.overrideRequestId)
    );
    if (!overrideRow) {
      throw new ConnectError("Override request not found", Code.NotFound);
    }
    if (overrideRow.status !== "pending") {
      throw new ConnectError(
        `Override request is already '${overrideRow.status}'`,
        Code.FailedPrecondition,
      );
    }

    const current = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getProposal(c, overrideRow.proposal_id)
    );
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }

    const smResult = transition(
      current.row.state as ProposalState,
      { type: "APPROVE_OVERRIDE" },
      {
        actorId,
        proposalActorId: current.row.actor_id,
        overrideRequesterId: overrideRow.requester_id,
      },
    );
    if (!smResult.ok) {
      const code =
        smResult.error.code === "SAME_ACTOR_OVERRIDE_APPROVE"
          ? Code.PermissionDenied
          : Code.FailedPrecondition;
      throw new ConnectError(smResult.error.message, code);
    }

    const now = new Date();

    const proposalWithLines = await this.db.withOrgTransaction(ctx.orgId, async (c) => {
      const updated = await this.repo.approveProposal(c, overrideRow.proposal_id, "blocked", actorId, {
        via: "override_approval",
        overrideRequestId: request.overrideRequestId,
      });

      await this.repo.approveOverrideRequest(c, request.overrideRequestId, actorId, now);

      const payload = toBinary(
        OverrideApprovedSchema,
        create(OverrideApprovedSchema, {
          orgId: ctx.orgId,
          proposalId: overrideRow.proposal_id,
          overrideRequestId: request.overrideRequestId,
          approverId: actorId,
          requesterId: overrideRow.requester_id,
          createdAt: dateToTimestamp(now),
        }),
      );
      await this.repo.insertOutboxEvent(c, {
        id: crypto.randomUUID(),
        orgId: ctx.orgId,
        eventType: "override.approved",
        aggregateId: overrideRow.proposal_id,
        partitionKey: overrideRow.proposal_id,
        payload,
      });

      return updated;
    });

    return create(ApproveOverrideResponseSchema, {
      proposal: proposalMessage(proposalWithLines.row, proposalWithLines.lines),
    });
  }

  private async listProposals(
    request: ListProposalsRequest,
    context: HandlerContext
  ) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_READ);
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

  private async buildScope(request: BuildScopeRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_EDIT_DRAFT);
    const scope = parseScopeDsl(request.scopeJson);

    const catalogHeaders = new Headers();
    catalogHeaders.set("x-org-id", ctx.orgId);
    if (this.opts.catalogServiceSecret) {
      const jwt = await signServiceJwt(
        "proposal_svc",
        "catalog",
        this.opts.catalogServiceSecret,
        this.opts.serviceJwtIssuer,
      );
      catalogHeaders.set("Authorization", `Bearer ${jwt}`);
    }

    const resolved = await resolveScope(this.catalogClient, scope, catalogHeaders);
    const scopedSkus = resolved.skus.map((sku) => create(ScopedSkuSchema, {
      skuId: sku.id, channelId: scope.channel_id, currentPrice: resolved.prices.get(sku.id),
    }));

    return create(BuildScopeResponseSchema, { skus: scopedSkus });
  }

  private async previewChangeSet(request: PreviewChangeSetRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_EDIT_DRAFT);

    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user required", Code.Unauthenticated);
    }

    const scope = parseScopeDsl(request.scopeJson);
    const rule = parseRepricingRule(request.ruleJson);

    const catalogHeaders = new Headers();
    catalogHeaders.set("x-org-id", ctx.orgId);
    if (this.opts.catalogServiceSecret) {
      const jwt = await signServiceJwt(
        "proposal_svc",
        "catalog",
        this.opts.catalogServiceSecret,
        this.opts.serviceJwtIssuer,
      );
      catalogHeaders.set("Authorization", `Bearer ${jwt}`);
    }

    const resolved = await resolveScope(this.catalogClient, scope, catalogHeaders);
    const lineInputs: Parameters<typeof this.repo.bulkInsertChangeSetLines>[3] = [];

    if (resolved.skus.length > 0) {
      for (const sku of resolved.skus) {
        const price = resolved.prices.get(sku.id)!;
        const currentMinor = price.amount;
        const currency = price.currency;
        const proposedMinor = applyRule(rule, currentMinor, currency);
        const diff = computeDiff(currentMinor, proposedMinor, currency);
        lineInputs.push({
          skuId: sku.id,
          channelId: scope.channel_id,
          currentPriceMinor: currentMinor,
          currentPriceCurrency: currency,
          proposedPriceMinor: proposedMinor,
          proposedPriceCurrency: currency,
          diffPct: diff.diffPct,
          diffAbsoluteMinor: diff.diffAbsoluteMinor,
          diffAbsoluteCurrency: diff.diffAbsoluteCurrency,
        });
      }
    }

    const { csRow, lineRows } = await this.db.withOrgTransaction(ctx.orgId, async (client) => {
      const csRow = await this.repo.createChangeSet(
        client,
        ctx.orgId,
        actorId,
        request.scopeJson,
        request.ruleJson,
      );
      const lineRows = await this.repo.bulkInsertChangeSetLines(
        client,
        ctx.orgId,
        csRow.id,
        lineInputs,
      );
      return { csRow, lineRows };
    });

    return create(PreviewChangeSetResponseSchema, {
      changeSet: changeSetMessage(csRow, lineRows),
    });
  }

  private async getChangeSet(request: GetChangeSetRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_READ);
    validateUuid(request.id, "id");
    const result = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.getChangeSet(c, request.id)
    );
    if (!result) throw new ConnectError("Change-set not found", Code.NotFound);
    return create(GetChangeSetResponseSchema, {
      changeSet: changeSetMessage(result.row, result.lines),
    });
  }

  private async listChangeSets(request: ListChangeSetsRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_READ);
    const result = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.listChangeSets(c, request)
    );
    return create(ListChangeSetsResponseSchema, {
      changeSets: result.rows.map((r) => changeSetMessage(r, [])),
      pagination: create(PaginatedResponseSchema, {
        nextPageToken: result.nextCursor,
        totalCount: result.totalCount,
      }),
    });
  }

  private async updateChangeSet(request: UpdateChangeSetRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_EDIT_DRAFT);
    validateUuid(request.id, "id");
    try {
      JSON.parse(request.scopeJson);
    } catch {
      throw new ConnectError("scope_json must be valid JSON", Code.InvalidArgument);
    }
    try {
      JSON.parse(request.ruleJson);
    } catch {
      throw new ConnectError("rule_json must be valid JSON", Code.InvalidArgument);
    }
    const result = await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.updateChangeSet(c, request.id, request.scopeJson, request.ruleJson)
    );
    return create(UpdateChangeSetResponseSchema, {
      changeSet: changeSetMessage(result.row, result.lines),
    });
  }

  private async submitChangeSet(request: SubmitChangeSetRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_CREATE_DRAFT);
    validateUuid(request.id, "id");
    if (!request.title.trim()) {
      throw new ConnectError("title is required", Code.InvalidArgument);
    }
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }
    const result = await this.db.withOrgTransaction(ctx.orgId, (client) =>
      this.repo.submitChangeSet(client, ctx.orgId, request.id, actorId, request.title)
    );
    return create(SubmitChangeSetResponseSchema, {
      proposal: proposalMessage(result.row, result.lines),
    });
  }

  private async discardChangeSet(request: DiscardChangeSetRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.PROPOSAL_DELETE_DRAFT);
    validateUuid(request.id, "id");
    await this.db.withOrgTransaction(ctx.orgId, (c) =>
      this.repo.discardChangeSet(c, request.id)
    );
    return create(DiscardChangeSetResponseSchema, {});
  }

  private async scheduleRollout(request: ScheduleRolloutRequest, context: HandlerContext) {
    await this.authenticator.authorize(context, ["gateway_svc"]);
    const ctx = requestContext(context);
    await this.enforce(ctx, Permission.EXECUTION_SCHEDULE);
    validateUuid(request.proposalId, "proposalId");
    const actorId = ctx.userId ?? "";
    if (!actorId) {
      throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
    }
    const effectiveAt = timestampToDate(request.effectiveAt, "effectiveAt");

    const result = await this.db.withOrgTransaction(ctx.orgId, async (client) => {
      const current = await this.repo.getProposal(client, request.proposalId);
      if (!current) {
        throw new ConnectError("Proposal not found", Code.NotFound);
      }
      if (current.row.state !== "approved") {
        throw new ConnectError(
          "Only approved proposals can be scheduled for rollout",
          Code.FailedPrecondition,
        );
      }
      try {
        await this.repo.createScheduledRollout(client, ctx.orgId, request.proposalId, effectiveAt);
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          throw new ConnectError(
            "A pending rollout already exists for this proposal",
            Code.AlreadyExists,
          );
        }
        throw err;
      }
      return current;
    });

    return create(ScheduleRolloutResponseSchema, {
      proposal: proposalMessage(result.row, result.lines),
    });
  }
}
