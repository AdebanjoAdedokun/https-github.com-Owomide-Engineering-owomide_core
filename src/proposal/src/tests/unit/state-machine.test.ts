import { describe, expect, it } from "vitest";
import { transition, type ProposalState, type TransitionContext } from "../../domain/state-machine.js";

const ctx: TransitionContext = {
  actorId: "user-approver",
  proposalActorId: "user-creator",
};

const sameActorCtx: TransitionContext = {
  actorId: "user-creator",
  proposalActorId: "user-creator",
};

const overrideCtx: TransitionContext = {
  actorId: "user-decider",
  proposalActorId: "user-creator",
  overrideRequesterId: "user-requester",
};

const sameOverrideActorCtx: TransitionContext = {
  actorId: "user-requester",
  proposalActorId: "user-creator",
  overrideRequesterId: "user-requester",
};

const noViolations = [] as const;
const violations = [{ skuId: "sku-1", code: "BELOW_COST", message: "Price below cost floor" }] as const;

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("happy path transitions", () => {
  it("draft + SUBMIT (no violations) → submitted, emits proposal.submitted", () => {
    const result = transition("draft", { type: "SUBMIT", marginViolations: noViolations }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("submitted");
    expect(result.sideEffects).toContainEqual({ type: "LOG_TRANSITION", fromState: "draft", toState: "submitted", meta: {} });
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "proposal.submitted" });
  });

  it("draft + SUBMIT (violations) → blocked, emits proposal.blocked", () => {
    const result = transition("draft", { type: "SUBMIT", marginViolations: violations }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("blocked");
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "proposal.blocked" });
    const logEffect = result.sideEffects.find((e) => e.type === "LOG_TRANSITION");
    expect(logEffect).toBeDefined();
    if (logEffect?.type !== "LOG_TRANSITION") return;
    expect(logEffect.toState).toBe("blocked");
    expect((logEffect.meta as { violations: typeof violations }).violations).toEqual(violations);
  });

  it("submitted + APPROVE (different actor) → approved, emits proposal.approved", () => {
    const result = transition("submitted", { type: "APPROVE" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("approved");
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "proposal.approved" });
  });

  it("approved + PUBLISH → published, emits proposal.published and APPLY_PRICES", () => {
    const result = transition("approved", { type: "PUBLISH" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("published");
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "proposal.published" });
    expect(result.sideEffects).toContainEqual({ type: "APPLY_PRICES" });
  });

  it("blocked + REQUEST_OVERRIDE → stays blocked, emits override.requested (no LOG_TRANSITION)", () => {
    const result = transition("blocked", { type: "REQUEST_OVERRIDE" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("blocked");
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "override.requested" });
    expect(result.sideEffects.some((e) => e.type === "LOG_TRANSITION")).toBe(false);
  });

  it("blocked + APPROVE_OVERRIDE (different actor) → approved, emits override.approved", () => {
    const result = transition("blocked", { type: "APPROVE_OVERRIDE" }, overrideCtx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState).toBe("approved");
    expect(result.sideEffects).toContainEqual({ type: "EMIT", eventType: "override.approved" });
  });
});

// ─── Guard violations ─────────────────────────────────────────────────────────

describe("guard violations", () => {
  it("APPROVE fails when actor is the proposal creator (SAME_ACTOR_APPROVE)", () => {
    const result = transition("submitted", { type: "APPROVE" }, sameActorCtx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SAME_ACTOR_APPROVE");
  });

  it("APPROVE_OVERRIDE fails when decider is the override requester (SAME_ACTOR_OVERRIDE_APPROVE)", () => {
    const result = transition("blocked", { type: "APPROVE_OVERRIDE" }, sameOverrideActorCtx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SAME_ACTOR_OVERRIDE_APPROVE");
  });
});

// ─── Invalid transitions ──────────────────────────────────────────────────────

const allStates: ProposalState[] = ["draft", "submitted", "blocked", "approved", "published"];

function expectInvalid(state: ProposalState, event: Parameters<typeof transition>[1]) {
  const result = transition(state, event, overrideCtx);
  expect(result.ok, `expected INVALID_TRANSITION for ${event.type} on ${state}`).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe("INVALID_TRANSITION");
}

describe("invalid transitions — SUBMIT", () => {
  for (const state of allStates.filter((s) => s !== "draft")) {
    it(`${state} + SUBMIT → INVALID_TRANSITION`, () => {
      expectInvalid(state, { type: "SUBMIT", marginViolations: noViolations });
    });
  }
});

describe("invalid transitions — APPROVE", () => {
  for (const state of allStates.filter((s) => s !== "submitted")) {
    it(`${state} + APPROVE → INVALID_TRANSITION`, () => {
      expectInvalid(state, { type: "APPROVE" });
    });
  }
});

describe("invalid transitions — PUBLISH", () => {
  for (const state of allStates.filter((s) => s !== "approved")) {
    it(`${state} + PUBLISH → INVALID_TRANSITION`, () => {
      expectInvalid(state, { type: "PUBLISH" });
    });
  }
});

describe("invalid transitions — REQUEST_OVERRIDE", () => {
  for (const state of allStates.filter((s) => s !== "blocked")) {
    it(`${state} + REQUEST_OVERRIDE → INVALID_TRANSITION`, () => {
      expectInvalid(state, { type: "REQUEST_OVERRIDE" });
    });
  }
});

describe("invalid transitions — APPROVE_OVERRIDE", () => {
  for (const state of allStates.filter((s) => s !== "blocked")) {
    it(`${state} + APPROVE_OVERRIDE → INVALID_TRANSITION`, () => {
      expectInvalid(state, { type: "APPROVE_OVERRIDE" });
    });
  }
});
