import { describe, expect, it } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";
import {
  ProposalSubmittedSchema,
  ProposalBlockedSchema,
  ProposalApprovedSchema,
  ProposalPublishedSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  OverrideRequestedSchema,
  OverrideApprovedSchema,
} from "@owomide/proto/events/override/v1_pb.js";
import { ImportCommittedSchema } from "@owomide/proto/events/import/v1_pb.js";
import type { Event } from "@owomide/bus";
import { mapEventToAuditRow } from "../../domain/event-mapper.js";

function makeEvent(type: string, payload: Uint8Array): Event {
  return {
    id: "evt-001",
    type,
    occurredAt: "2026-07-25T10:00:00Z",
    partitionKey: "partition-1",
    payload,
  };
}

const ORG = "org-test-001";
const PROPOSAL = "proposal-001";
const ACTOR = "actor-001";

describe("mapEventToAuditRow", () => {
  it("maps proposal.submitted", () => {
    const payload = toBinary(
      ProposalSubmittedSchema,
      create(ProposalSubmittedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        changeSetId: "cs-001",
        actorId: ACTOR,
      }),
    );
    const row = mapEventToAuditRow(makeEvent("proposal.submitted", payload));
    expect(row.orgId).toBe(ORG);
    expect(row.entityType).toBe("proposal");
    expect(row.entityId).toBe(PROPOSAL);
    expect(row.actorId).toBe(ACTOR);
    expect(row.eventType).toBe("proposal.submitted");
    expect(row.eventId).toBe("evt-001");
  });

  it("maps proposal.blocked", () => {
    const payload = toBinary(
      ProposalBlockedSchema,
      create(ProposalBlockedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        actorId: ACTOR,
      }),
    );
    const row = mapEventToAuditRow(makeEvent("proposal.blocked", payload));
    expect(row.entityType).toBe("proposal");
    expect(row.entityId).toBe(PROPOSAL);
    expect(row.actorId).toBe(ACTOR);
  });

  it("maps proposal.approved — actorId is the approver, not the proposal creator", () => {
    const payload = toBinary(
      ProposalApprovedSchema,
      create(ProposalApprovedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        approverId: "approver-001",
        actorId: "proposal-creator",
      }),
    );
    const row = mapEventToAuditRow(makeEvent("proposal.approved", payload));
    expect(row.entityType).toBe("proposal");
    expect(row.entityId).toBe(PROPOSAL);
    expect(row.actorId).toBe("approver-001");
  });

  it("maps proposal.published", () => {
    const payload = toBinary(
      ProposalPublishedSchema,
      create(ProposalPublishedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        actorId: ACTOR,
      }),
    );
    const row = mapEventToAuditRow(makeEvent("proposal.published", payload));
    expect(row.entityType).toBe("proposal");
    expect(row.entityId).toBe(PROPOSAL);
    expect(row.actorId).toBe(ACTOR);
  });

  it("maps override.requested", () => {
    const payload = toBinary(
      OverrideRequestedSchema,
      create(OverrideRequestedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        overrideRequestId: "or-001",
        actorId: ACTOR,
        justification: "market pressure",
      }),
    );
    const row = mapEventToAuditRow(makeEvent("override.requested", payload));
    expect(row.entityType).toBe("override");
    expect(row.entityId).toBe("or-001");
    expect(row.actorId).toBe(ACTOR);
  });

  it("maps override.approved", () => {
    const payload = toBinary(
      OverrideApprovedSchema,
      create(OverrideApprovedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        overrideRequestId: "or-001",
        approverId: "approver-001",
        requesterId: ACTOR,
      }),
    );
    const row = mapEventToAuditRow(makeEvent("override.approved", payload));
    expect(row.entityType).toBe("override");
    expect(row.entityId).toBe("or-001");
    expect(row.actorId).toBe("approver-001");
  });

  it("maps import.committed", () => {
    const payload = toBinary(
      ImportCommittedSchema,
      create(ImportCommittedSchema, {
        orgId: ORG,
        batchId: "batch-001",
        fileUrl: "s3://bucket/file.csv",
        actorId: ACTOR,
        templateId: "tpl-001",
      }),
    );
    const row = mapEventToAuditRow(makeEvent("import.committed", payload));
    expect(row.entityType).toBe("import");
    expect(row.entityId).toBe("batch-001");
    expect(row.actorId).toBe(ACTOR);
  });

  it("includes full payload as JSON", () => {
    const payload = toBinary(
      ProposalSubmittedSchema,
      create(ProposalSubmittedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        changeSetId: "cs-001",
        actorId: ACTOR,
      }),
    );
    const row = mapEventToAuditRow(makeEvent("proposal.submitted", payload));
    expect(row.payload).toHaveProperty("orgId", ORG);
    expect(row.payload).toHaveProperty("proposalId", PROPOSAL);
  });

  it("throws on unknown event type", () => {
    const payload = new Uint8Array([]);
    expect(() => mapEventToAuditRow(makeEvent("unknown.event", payload))).toThrow(
      "Unknown event type: unknown.event",
    );
  });
});
