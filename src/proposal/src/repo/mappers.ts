import { create } from "@bufbuild/protobuf";
import {
  ProposalSchema,
  ProposalLineSchema,
  ProposalCommentSchema,
  OverrideRequestSchema,
  ProposalState,
  type Proposal,
  type ProposalLine,
  type ProposalComment,
  type OverrideRequest,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import { dateToTimestamp } from "../domain/time.js";

export interface ProposalRow {
  id: string;
  org_id: string;
  state: string;
  actor_id: string;
  title: string;
  change_set_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProposalLineRow {
  id: string;
  org_id: string;
  proposal_id: string;
  sku_id: string;
  channel_id: string;
  current_price_minor: string;
  current_price_currency: string;
  proposed_price_minor: string;
  proposed_price_currency: string;
  reason: string;
}

function protoState(s: string): ProposalState {
  switch (s) {
    case "draft":
      return ProposalState.DRAFT;
    case "submitted":
      return ProposalState.SUBMITTED;
    case "blocked":
      return ProposalState.BLOCKED;
    case "approved":
      return ProposalState.APPROVED;
    case "published":
      return ProposalState.PUBLISHED;
    default:
      return ProposalState.UNSPECIFIED;
  }
}

export function proposalLineMessage(row: ProposalLineRow): ProposalLine {
  return create(ProposalLineSchema, {
    id: row.id,
    orgId: row.org_id,
    proposalId: row.proposal_id,
    skuId: row.sku_id,
    channelId: row.channel_id,
    currentPrice: create(MoneySchema, {
      amount: BigInt(row.current_price_minor),
      currency: row.current_price_currency,
    }),
    proposedPrice: create(MoneySchema, {
      amount: BigInt(row.proposed_price_minor),
      currency: row.proposed_price_currency,
    }),
    reason: row.reason,
  });
}

export interface CommentRow {
  id: string;
  org_id: string;
  proposal_id: string;
  author_id: string;
  body: string;
  occurred_at: Date;
}

export function commentMessage(row: CommentRow): ProposalComment {
  return create(ProposalCommentSchema, {
    id: row.id,
    orgId: row.org_id,
    proposalId: row.proposal_id,
    authorId: row.author_id,
    body: row.body,
    occurredAt: dateToTimestamp(row.occurred_at),
  });
}

export interface OverrideRequestRow {
  id: string;
  org_id: string;
  proposal_id: string;
  requester_id: string;
  justification: string;
  status: string;
  requested_at: Date;
  decided_at: Date | null;
  decider_id: string | null;
}

export function overrideRequestMessage(row: OverrideRequestRow): OverrideRequest {
  return create(OverrideRequestSchema, {
    id: row.id,
    orgId: row.org_id,
    proposalId: row.proposal_id,
    requesterId: row.requester_id,
    justification: row.justification,
    status: row.status,
    requestedAt: dateToTimestamp(row.requested_at),
    decidedAt: row.decided_at ? dateToTimestamp(row.decided_at) : undefined,
    deciderId: row.decider_id ?? "",
  });
}

export function proposalMessage(row: ProposalRow, lines: ProposalLineRow[]): Proposal {
  return create(ProposalSchema, {
    id: row.id,
    orgId: row.org_id,
    state: protoState(row.state),
    actorId: row.actor_id,
    title: row.title,
    changeSetId: row.change_set_id ?? "",
    lines: lines.map(proposalLineMessage),
    createdAt: dateToTimestamp(row.created_at),
    updatedAt: dateToTimestamp(row.updated_at),
  });
}
