import { describe, expect, it } from "vitest";
import { describeActivity, KIND_ORDER, type ActivityEntry } from "../../domain/activity.js";

const entry = (over: Partial<ActivityEntry> & Pick<ActivityEntry, "kind">): ActivityEntry => ({
  initiativeId: "i-1",
  proposalId: "p-1",
  proposalVersionId: "v-1",
  versionNumber: 2,
  occurredAt: new Date("2026-10-12T09:00:00Z"),
  actorId: "user-tunde",
  detail: {},
  sourceTable: "decision",
  sourceId: "d-1",
  ...over,
});

describe("describeActivity", () => {
  it("falls back to the user id so an entry is never attributed to nobody", () => {
    expect(describeActivity(entry({ kind: "decision_approved" }))).toBe(
      "user-tunde approved proposal version 2."
    );
  });

  it("adds a reason only when one was given", () => {
    const names = () => "Tunde";
    expect(
      describeActivity(
        entry({ kind: "decision_rejected", detail: { reason: "  Too steep " } }),
        names
      )
    ).toBe("Tunde rejected proposal version 2. Reason: Too steep");
    expect(
      describeActivity(entry({ kind: "decision_approved", detail: { reason: "" } }), names)
    ).toBe("Tunde approved proposal version 2.");
  });

  it("summarises implementation results and names the hand-off file", () => {
    expect(
      describeActivity(
        entry({
          kind: "implementation_recorded",
          detail: { implemented: 31, implemented_different: 0, failed: 0 },
        })
      )
    ).toBe("user-tunde recorded results for proposal version 2: 31 implemented.");
    expect(
      describeActivity(
        entry({ kind: "exported", detail: { kind: "handoff_summary", line_count: 1 } })
      )
    ).toBe("user-tunde downloaded the hand-off summary for proposal version 2 (1 line).");
  });

  it("orders decisions after submissions and implementation last", () => {
    expect(KIND_ORDER.version_submitted).toBeLessThan(KIND_ORDER.decision_approved);
    expect(KIND_ORDER.decision_approved).toBeLessThan(KIND_ORDER.exported);
    expect(KIND_ORDER.exported).toBeLessThan(KIND_ORDER.implementation_recorded);
  });
});
