import { fromBinary, toJson } from "@bufbuild/protobuf";
import type { Event } from "@owomide/bus";
import {
  ProposalSubmittedSchema,
  ProposalBlockedSchema,
  ProposalApprovedSchema,
  ProposalPublishedSchema,
  type ProposalSubmitted,
  type ProposalBlocked,
  type ProposalApproved,
  type ProposalPublished,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  OverrideRequestedSchema,
  OverrideApprovedSchema,
  type OverrideRequested,
  type OverrideApproved,
} from "@owomide/proto/events/override/v1_pb.js";
import {
  ImportCommittedSchema,
  type ImportCommitted,
} from "@owomide/proto/events/import/v1_pb.js";

export interface AuditLogRow {
  orgId: string;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

interface EventMapping {
  entityType: string;
  decode: (payload: Uint8Array) => {
    orgId: string;
    entityId: string;
    actorId: string;
    json: Record<string, unknown>;
  };
}

const MAPPINGS: Record<string, EventMapping> = {
  "proposal.submitted": {
    entityType: "proposal",
    decode(payload) {
      const msg: ProposalSubmitted = fromBinary(ProposalSubmittedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.proposalId,
        actorId: msg.actorId,
        json: toJson(ProposalSubmittedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "proposal.blocked": {
    entityType: "proposal",
    decode(payload) {
      const msg: ProposalBlocked = fromBinary(ProposalBlockedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.proposalId,
        actorId: msg.actorId,
        json: toJson(ProposalBlockedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "proposal.approved": {
    entityType: "proposal",
    decode(payload) {
      const msg: ProposalApproved = fromBinary(ProposalApprovedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.proposalId,
        actorId: msg.approverId,
        json: toJson(ProposalApprovedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "proposal.published": {
    entityType: "proposal",
    decode(payload) {
      const msg: ProposalPublished = fromBinary(ProposalPublishedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.proposalId,
        actorId: msg.actorId,
        json: toJson(ProposalPublishedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "override.requested": {
    entityType: "override",
    decode(payload) {
      const msg: OverrideRequested = fromBinary(OverrideRequestedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.overrideRequestId,
        actorId: msg.actorId,
        json: toJson(OverrideRequestedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "override.approved": {
    entityType: "override",
    decode(payload) {
      const msg: OverrideApproved = fromBinary(OverrideApprovedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.overrideRequestId,
        actorId: msg.approverId,
        json: toJson(OverrideApprovedSchema, msg) as Record<string, unknown>,
      };
    },
  },
  "import.committed": {
    entityType: "import",
    decode(payload) {
      const msg: ImportCommitted = fromBinary(ImportCommittedSchema, payload);
      return {
        orgId: msg.orgId,
        entityId: msg.batchId,
        actorId: msg.actorId,
        json: toJson(ImportCommittedSchema, msg) as Record<string, unknown>,
      };
    },
  },
};

export const SUBSCRIBED_TOPICS = Object.keys(MAPPINGS);

export function mapEventToAuditRow(event: Event): AuditLogRow {
  const mapping = MAPPINGS[event.type];
  if (!mapping) {
    throw new Error(`Unknown event type: ${event.type}`);
  }

  const decoded = mapping.decode(event.payload);

  return {
    orgId: decoded.orgId,
    eventId: event.id,
    eventType: event.type,
    entityType: mapping.entityType,
    entityId: decoded.entityId,
    actorId: decoded.actorId,
    occurredAt: event.occurredAt,
    payload: decoded.json,
  };
}
