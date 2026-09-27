// Pricing Initiative lifecycle — pure, no I/O (PRD INIT-010 to INIT-014; decision D-08).
//
// The same table is enforced in the database by migration 0008
// (proposal.initiative_transition_allowed), and an integration test keeps the two identical.

export type InitiativeState =
  | "initiated"
  | "in_development"
  | "in_review"
  | "awaiting_approval"
  | "ready_for_execution"
  | "implemented"
  | "monitoring"
  | "completed"
  | "on_hold"
  | "cancelled";

export const INITIATIVE_STATES: readonly InitiativeState[] = [
  "initiated",
  "in_development",
  "in_review",
  "awaiting_approval",
  "ready_for_execution",
  "implemented",
  "monitoring",
  "completed",
  "on_hold",
  "cancelled",
];

/** Allowed moves. `completed` and `cancelled` are final. */
export const ALLOWED_TRANSITIONS: Readonly<Record<InitiativeState, readonly InitiativeState[]>> = {
  initiated: ["in_development", "on_hold", "cancelled"],
  in_development: ["in_review", "awaiting_approval", "on_hold", "cancelled"],
  in_review: ["in_development", "awaiting_approval", "on_hold", "cancelled"],
  // Back to development after Request Changes or Reject; forward after Approve.
  awaiting_approval: ["in_development", "ready_for_execution", "on_hold", "cancelled"],
  ready_for_execution: ["implemented", "on_hold", "cancelled"],
  implemented: ["monitoring", "completed"],
  monitoring: ["completed"],
  on_hold: ["in_development", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Moves that must carry a written reason: pausing, cancelling and going backwards. */
export function reasonRequired(from: InitiativeState, to: InitiativeState): boolean {
  if (to === "on_hold" || to === "cancelled") return true;
  return INITIATIVE_STATES.indexOf(to) < INITIATIVE_STATES.indexOf(from) && from !== "on_hold";
}

export type TransitionCheck =
  { ok: true } | { ok: false; code: "TRANSITION_NOT_ALLOWED" | "REASON_REQUIRED"; message: string };

export function checkTransition(
  from: InitiativeState,
  to: InitiativeState,
  reason: string
): TransitionCheck {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      code: "TRANSITION_NOT_ALLOWED",
      message: `An initiative cannot move from ${from} to ${to}.`,
    };
  }
  if (reasonRequired(from, to) && !reason.trim()) {
    return {
      ok: false,
      code: "REASON_REQUIRED",
      message: `Moving an initiative from ${from} to ${to} needs a reason.`,
    };
  }
  return { ok: true };
}
