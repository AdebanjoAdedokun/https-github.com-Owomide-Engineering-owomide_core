import { fromBinary } from "@bufbuild/protobuf";
import {
  ProposalApprovedSchema,
  ProposalBlockedSchema,
  ProposalPublishedSchema,
  ProposalSubmittedSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  OverrideApprovedSchema,
  OverrideRequestedSchema,
} from "@owomide/proto/events/override/v1_pb.js";
import { ImportCommittedSchema } from "@owomide/proto/events/import/v1_pb.js";
import { isSubscribedEventType, type EventFacts } from "./routing.js";

/** The fields of a bus event that Notify reads (structurally the `@owomide/bus` Event). */
export interface IncomingEvent {
  id: string;
  type: string;
  payload: Uint8Array;
}

export class UndecodableEventError extends Error {}

function required(value: string, field: string, type: string): string {
  if (!value.trim())
    throw new UndecodableEventError(`${type} is missing ${field}`);
  return value;
}

/** Decodes an event into routing facts. Returns null for event types Notify ignores. */
export function decodeEvent(event: IncomingEvent): EventFacts | null {
  const { type } = event;
  if (!isSubscribedEventType(type)) return null;
  const eventId = required(event.id, "id", type);
  switch (type) {
    case "proposal.submitted": {
      const m = fromBinary(ProposalSubmittedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
      };
    }
    case "proposal.blocked": {
      const m = fromBinary(ProposalBlockedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
        blockedLineCount: m.violations.length,
      };
    }
    case "proposal.approved": {
      const m = fromBinary(ProposalApprovedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
        approverId: m.approverId || m.actorId,
      };
    }
    case "proposal.published": {
      const m = fromBinary(ProposalPublishedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
      };
    }
    case "override.requested": {
      const m = fromBinary(OverrideRequestedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
      };
    }
    case "override.approved": {
      const m = fromBinary(OverrideApprovedSchema, event.payload);
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.approverId, "approver_id", type),
        entityType: "proposal",
        entityId: required(m.proposalId, "proposal_id", type),
        approverId: m.approverId,
        requesterId: required(m.requesterId, "requester_id", type),
      };
    }
    case "import.committed": {
      const m = fromBinary(ImportCommittedSchema, event.payload);
      const c = m.rowCounts;
      return {
        eventId,
        type,
        orgId: required(m.orgId, "org_id", type),
        actorId: required(m.actorId, "actor_id", type),
        entityType: "import_batch",
        entityId: required(m.batchId, "batch_id", type),
        importCounts: {
          ok: c?.ok ?? 0,
          warned: c?.warned ?? 0,
          excluded: c?.excluded ?? 0,
          errored: c?.errored ?? 0,
        },
      };
    }
  }
}
