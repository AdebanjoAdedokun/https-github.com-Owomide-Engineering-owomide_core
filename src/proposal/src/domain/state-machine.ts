export type ProposalState = "draft" | "submitted" | "blocked" | "approved" | "published";

export interface MarginViolation {
  skuId: string;
  code: string;
  message: string;
}

export type ProposalEvent =
  | { type: "SUBMIT"; marginViolations: readonly MarginViolation[] }
  | { type: "APPROVE" }
  | { type: "PUBLISH" }
  | { type: "REQUEST_OVERRIDE" }
  | { type: "APPROVE_OVERRIDE" };

export interface TransitionContext {
  actorId: string;
  proposalActorId: string;
  overrideRequesterId?: string;
}

export type BusEventType =
  | "proposal.submitted"
  | "proposal.blocked"
  | "proposal.approved"
  | "proposal.published"
  | "override.requested"
  | "override.approved";

export type SideEffect =
  | { type: "LOG_TRANSITION"; fromState: ProposalState; toState: ProposalState; meta: Record<string, unknown> }
  | { type: "EMIT"; eventType: BusEventType }
  | { type: "APPLY_PRICES" };

export interface TransitionError {
  code: "INVALID_TRANSITION" | "SAME_ACTOR_APPROVE" | "SAME_ACTOR_OVERRIDE_APPROVE";
  message: string;
}

export type TransitionResult =
  | { ok: true; nextState: ProposalState; sideEffects: readonly SideEffect[] }
  | { ok: false; error: TransitionError };

function invalid(current: ProposalState, eventType: string): TransitionResult {
  return {
    ok: false,
    error: {
      code: "INVALID_TRANSITION",
      message: `Cannot apply event '${eventType}' to a proposal in state '${current}'`,
    },
  };
}

export function transition(
  current: ProposalState,
  event: ProposalEvent,
  ctx: TransitionContext,
): TransitionResult {
  switch (event.type) {
    case "SUBMIT": {
      if (current !== "draft") return invalid(current, event.type);
      if (event.marginViolations.length === 0) {
        return {
          ok: true,
          nextState: "submitted",
          sideEffects: [
            { type: "LOG_TRANSITION", fromState: current, toState: "submitted", meta: {} },
            { type: "EMIT", eventType: "proposal.submitted" },
          ],
        };
      }
      return {
        ok: true,
        nextState: "blocked",
        sideEffects: [
          { type: "LOG_TRANSITION", fromState: current, toState: "blocked", meta: { violations: event.marginViolations } },
          { type: "EMIT", eventType: "proposal.blocked" },
        ],
      };
    }

    case "APPROVE": {
      if (current !== "submitted") return invalid(current, event.type);
      if (ctx.actorId === ctx.proposalActorId) {
        return {
          ok: false,
          error: {
            code: "SAME_ACTOR_APPROVE",
            message: "The approver must differ from the proposal creator",
          },
        };
      }
      return {
        ok: true,
        nextState: "approved",
        sideEffects: [
          { type: "LOG_TRANSITION", fromState: current, toState: "approved", meta: {} },
          { type: "EMIT", eventType: "proposal.approved" },
        ],
      };
    }

    case "PUBLISH": {
      if (current !== "approved") return invalid(current, event.type);
      return {
        ok: true,
        nextState: "published",
        sideEffects: [
          { type: "LOG_TRANSITION", fromState: current, toState: "published", meta: {} },
          { type: "EMIT", eventType: "proposal.published" },
          { type: "APPLY_PRICES" },
        ],
      };
    }

    case "REQUEST_OVERRIDE": {
      if (current !== "blocked") return invalid(current, event.type);
      // State does not change; handler writes the override_request row.
      return {
        ok: true,
        nextState: "blocked",
        sideEffects: [{ type: "EMIT", eventType: "override.requested" }],
      };
    }

    case "APPROVE_OVERRIDE": {
      if (current !== "blocked") return invalid(current, event.type);
      if (ctx.actorId === ctx.overrideRequesterId) {
        return {
          ok: false,
          error: {
            code: "SAME_ACTOR_OVERRIDE_APPROVE",
            message: "The override decider must differ from the override requester",
          },
        };
      }
      return {
        ok: true,
        nextState: "approved",
        sideEffects: [
          { type: "LOG_TRANSITION", fromState: current, toState: "approved", meta: {} },
          { type: "EMIT", eventType: "override.approved" },
        ],
      };
    }
  }
}
