import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  INITIATIVE_STATES,
  checkTransition,
  reasonRequired,
} from "../../domain/initiative-lifecycle.js";

describe("initiative lifecycle", () => {
  it("follows the Journey J1 path forwards without reasons", () => {
    const path = [
      "initiated",
      "in_development",
      "awaiting_approval",
      "ready_for_execution",
      "implemented",
      "monitoring",
      "completed",
    ] as const;
    for (let i = 1; i < path.length; i += 1) {
      expect(checkTransition(path[i - 1]!, path[i]!, "")).toEqual({ ok: true });
    }
  });

  it("needs a reason to pause, cancel or go back, but not to resume", () => {
    expect(checkTransition("awaiting_approval", "in_development", "")).toMatchObject({
      ok: false,
      code: "REASON_REQUIRED",
    });
    expect(checkTransition("awaiting_approval", "in_development", "Changes requested").ok).toBe(
      true
    );
    expect(reasonRequired("in_development", "on_hold")).toBe(true);
    expect(reasonRequired("ready_for_execution", "cancelled")).toBe(true);
    expect(reasonRequired("on_hold", "in_development")).toBe(false);
  });

  it("never leaves a final state and never skips approval", () => {
    expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(checkTransition("in_development", "ready_for_execution", "x")).toMatchObject({
      ok: false,
      code: "TRANSITION_NOT_ALLOWED",
    });
    expect(checkTransition("implemented", "cancelled", "x").ok).toBe(false);
  });

  it("lists only known states", () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(INITIATIVE_STATES).toContain(from);
      for (const to of tos) expect(INITIATIVE_STATES).toContain(to);
    }
  });
});
