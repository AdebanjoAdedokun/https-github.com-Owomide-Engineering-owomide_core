// Initiative and Proposal history — pure, no I/O.
//
// Entries come from the proposal.activity view (migration 0007), which derives them from the
// append-only records. This module turns an entry into one plain-language line for the history
// panel. It never shows prices, costs or margins; the view does not carry them.

export type ActivityKind =
  | "initiative_created"
  | "initiative_state_changed"
  | "scope_member_removed"
  | "assumption_added"
  | "version_created"
  | "version_submitted"
  | "decision_approved"
  | "decision_rejected"
  | "decision_changes_requested"
  | "exported"
  | "implementation_recorded";

export interface ActivityEntry {
  initiativeId: string | null;
  proposalId: string | null;
  proposalVersionId: string | null;
  versionNumber: number | null;
  occurredAt: Date;
  actorId: string;
  kind: ActivityKind;
  detail: Record<string, unknown>;
  sourceTable: string;
  sourceId: string;
}

const STATE_LABELS: Record<string, string> = {
  initiated: "Initiated",
  in_development: "In development",
  in_review: "In review",
  awaiting_approval: "Awaiting approval",
  ready_for_execution: "Ready for execution",
  implemented: "Implemented",
  monitoring: "Monitoring",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (typeof value === "number" ? value : 0);
const withReason = (sentence: string, reason: unknown): string =>
  text(reason).trim() ? `${sentence} Reason: ${text(reason).trim()}` : sentence;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One sentence describing the entry. `nameOf` turns a user id into a display name; the id is
 * used when no name is known, so an entry is never attributed to nobody.
 */
export function describeActivity(
  entry: ActivityEntry,
  nameOf: (userId: string) => string | undefined = () => undefined
): string {
  const who = nameOf(entry.actorId) ?? entry.actorId;
  const version = entry.versionNumber === null ? "" : ` version ${entry.versionNumber}`;
  const d = entry.detail;
  switch (entry.kind) {
    case "initiative_created":
      return `${who} created the initiative "${text(d.title)}".`;
    case "initiative_state_changed":
      return withReason(
        `${who} moved the initiative from ${STATE_LABELS[text(d.from)] ?? text(d.from)} to ${STATE_LABELS[text(d.to)] ?? text(d.to)}.`,
        d.reason
      );
    case "scope_member_removed":
      return withReason(`${who} removed ${text(d.sku_id)} from the scope.`, d.reason);
    case "assumption_added":
      return `${who} recorded an assumption: ${text(d.statement)}`;
    case "version_created":
      return `${who} started proposal${version}.`;
    case "version_submitted":
      return `${who} submitted proposal${version} for approval.`;
    case "decision_approved":
      return withReason(`${who} approved proposal${version}.`, d.reason);
    case "decision_rejected":
      return withReason(`${who} rejected proposal${version}.`, d.reason);
    case "decision_changes_requested":
      return withReason(`${who} requested changes to proposal${version}.`, d.reason);
    case "exported":
      return `${who} downloaded the ${text(d.kind) === "execution_csv" ? "price change file" : "hand-off summary"} for proposal${version} (${plural(count(d.line_count), "line", "lines")}).`;
    case "implementation_recorded": {
      const parts = [
        count(d.implemented) && plural(count(d.implemented), "implemented", "implemented"),
        count(d.implemented_different) &&
          `${count(d.implemented_different)} implemented at a different price`,
        count(d.failed) && `${count(d.failed)} failed`,
      ].filter(Boolean);
      return `${who} recorded results for proposal${version}: ${parts.join(", ") || "no lines"}.`;
    }
  }
}

/** Lifecycle order used to break ties between entries with the same timestamp. */
export const KIND_ORDER: Readonly<Record<ActivityKind, number>> = {
  initiative_created: 10,
  assumption_added: 20,
  initiative_state_changed: 30,
  version_created: 40,
  scope_member_removed: 50,
  version_submitted: 60,
  decision_changes_requested: 70,
  decision_rejected: 70,
  decision_approved: 70,
  exported: 80,
  implementation_recorded: 90,
};
