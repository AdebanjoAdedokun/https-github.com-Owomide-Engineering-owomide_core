import { create, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  ProposalBlockedSchema,
  ProposalSubmittedSchema,
  ViolationSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import { OverrideApprovedSchema } from "@owomide/proto/events/override/v1_pb.js";
import { ImportCommittedSchema } from "@owomide/proto/events/import/v1_pb.js";
import { decodeEvent, UndecodableEventError } from "../../domain/decode.js";
import {
  channelsFor,
  resolveRecipients,
  ROUTES,
  SUBSCRIBED_EVENT_TYPES,
  type EventFacts,
  type RecipientDirectory,
} from "../../domain/routing.js";
import { render } from "../../domain/templates.js";

const ORG = "org-lagos";
const directory = (
  byPermission: Record<string, string[]>,
): RecipientDirectory => ({
  usersWithPermission: async (_org, permission) =>
    byPermission[permission] ?? [],
  emailAddresses: async () => new Map(),
});

const facts = (
  over: Partial<EventFacts> & Pick<EventFacts, "type">,
): EventFacts => ({
  eventId: "evt-1",
  orgId: ORG,
  actorId: "ada",
  entityType: "proposal",
  entityId: "11111111-1111-1111-1111-111111111111",
  ...over,
});

describe("routing", () => {
  it("has a route for every subscribed event", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(
      [...SUBSCRIBED_EVENT_TYPES].sort(),
    );
  });

  it("asks approvers to review a submission, never the submitter (FLOW-013)", async () => {
    const people = directory({ "approval.approve": ["tunde", "ada", "bisi"] });
    const recipients = await resolveRecipients(
      facts({ type: "proposal.submitted" }),
      { submitterUserId: "ada", approverUserId: null },
      people,
    );
    expect(recipients).toEqual(["bisi", "tunde"]);
  });

  it("tells the submitter about a decision, and not the person who made it", async () => {
    const recipients = await resolveRecipients(
      facts({
        type: "proposal.approved",
        actorId: "tunde",
        approverId: "tunde",
      }),
      { submitterUserId: "ada", approverUserId: "tunde" },
      directory({}),
    );
    expect(recipients).toEqual(["ada"]);
  });

  it("tells the submitter, approver and executors when approved changes are released", async () => {
    const recipients = await resolveRecipients(
      facts({ type: "proposal.published", actorId: "tunde" }),
      { submitterUserId: "ada", approverUserId: "tunde" },
      directory({ "execution.mark_implemented": ["emeka", "ada"] }),
    );
    expect(recipients).toEqual(["ada", "emeka"]);
  });

  it("routes overrides to override approvers and the outcome to the requester", async () => {
    expect(
      await resolveRecipients(
        facts({ type: "override.requested" }),
        null,
        directory({ "override.approve": ["ada", "femi"] }),
      ),
    ).toEqual(["femi"]);
    expect(
      await resolveRecipients(
        facts({
          type: "override.approved",
          actorId: "femi",
          approverId: "femi",
          requesterId: "ada",
        }),
        null,
        directory({}),
      ),
    ).toEqual(["ada"]);
  });

  it("tells the uploader that their import finished", async () => {
    expect(
      await resolveRecipients(
        facts({ type: "import.committed", entityType: "import_batch" }),
        null,
        directory({}),
      ),
    ).toEqual(["ada"]);
  });

  it("keeps requests that need action in the inbox even when someone opts out", () => {
    const optOut = { emailEnabled: false, inAppEnabled: false };
    expect(channelsFor("proposal.submitted", optOut)).toEqual({
      inApp: true,
      email: false,
    });
    expect(channelsFor("proposal.approved", optOut)).toEqual({
      inApp: false,
      email: false,
    });
    expect(channelsFor("proposal.approved", undefined)).toEqual({
      inApp: true,
      email: true,
    });
  });
});

describe("templates", () => {
  it("never puts money, costs or margins in a message", () => {
    for (const type of SUBSCRIBED_EVENT_TYPES) {
      const out = render(
        facts({
          type,
          entityType: type === "import.committed" ? "import_batch" : "proposal",
          blockedLineCount: 3,
          importCounts: { ok: 118, warned: 2, excluded: 0, errored: 8 },
        }),
        "https://app.example.test/",
      );
      const text = `${out.title} ${out.body} ${out.emailSubject} ${out.emailText}`;
      expect(text).not.toMatch(/₦|NGN|\bcost\b|\bmargin of\b|%/i);
      expect(out.emailText).toContain(
        `https://app.example.test${out.linkPath}`,
      );
    }
  });

  it("summarises an import in plain words", () => {
    const out = render(
      facts({
        type: "import.committed",
        entityType: "import_batch",
        entityId: "batch-7",
        importCounts: { ok: 118, warned: 2, excluded: 1, errored: 8 },
      }),
      "https://app.example.test",
    );
    expect(out.body).toBe(
      "120 rows were saved, 8 rows were rejected with reasons, 1 row was excluded.",
    );
    expect(out.linkPath).toBe("/imports/batch-7");
  });
});

describe("decoding", () => {
  it("decodes proposal and import events and ignores others", () => {
    const submitted = decodeEvent({
      id: "evt-9",
      type: "proposal.submitted",
      payload: toBinary(
        ProposalSubmittedSchema,
        create(ProposalSubmittedSchema, {
          orgId: ORG,
          proposalId: "p-1",
          actorId: "ada",
        }),
      ),
    });
    expect(submitted).toMatchObject({
      type: "proposal.submitted",
      entityId: "p-1",
      actorId: "ada",
    });

    const blocked = decodeEvent({
      id: "evt-10",
      type: "proposal.blocked",
      payload: toBinary(
        ProposalBlockedSchema,
        create(ProposalBlockedSchema, {
          orgId: ORG,
          proposalId: "p-1",
          actorId: "ada",
          violations: [
            create(ViolationSchema, {}),
            create(ViolationSchema, {}),
          ],
        }),
      ),
    });
    expect(blocked?.blockedLineCount).toBe(2);

    const imported = decodeEvent({
      id: "evt-11",
      type: "import.committed",
      payload: toBinary(
        ImportCommittedSchema,
        create(ImportCommittedSchema, {
          orgId: ORG,
          batchId: "b-1",
          actorId: "ada",
          rowCounts: { ok: 5, warned: 1, excluded: 0, errored: 2 },
        }),
      ),
    });
    expect(imported?.importCounts).toEqual({
      ok: 5,
      warned: 1,
      excluded: 0,
      errored: 2,
    });

    expect(
      decodeEvent({
        id: "evt-12",
        type: "catalog.price_updated",
        payload: new Uint8Array(),
      }),
    ).toBeNull();
  });

  it("refuses an event without the fields routing depends on", () => {
    expect(() =>
      decodeEvent({
        id: "evt-13",
        type: "override.approved",
        payload: toBinary(
          OverrideApprovedSchema,
          create(OverrideApprovedSchema, {
            orgId: ORG,
            proposalId: "p-1",
            approverId: "femi",
          }),
        ),
      }),
    ).toThrow(UndecodableEventError);
  });
});
