import type pg from "pg";
import type { ActivityEntry, ActivityKind } from "../domain/activity.js";

interface ActivityRow {
  initiative_id: string | null;
  proposal_id: string | null;
  proposal_version_id: string | null;
  version_number: number | null;
  occurred_at: Date;
  actor_id: string;
  kind: ActivityKind;
  detail: Record<string, unknown>;
  source_table: string;
  source_id: string;
}

export interface ActivityQuery {
  /** Everything for an Initiative, including its Proposals. */
  initiativeId?: string;
  /** Only one Proposal. */
  proposalId?: string;
  limit: number;
}

/**
 * The timeline, oldest first, in a stable order (time, lifecycle order, source row). Runs inside
 * a transaction that has set app.org_id, so row-level security scopes it to one organisation.
 */
export async function listActivity(
  client: pg.ClientBase,
  query: ActivityQuery
): Promise<ActivityEntry[]> {
  if (!query.initiativeId === !query.proposalId) {
    throw new Error("exactly one of initiativeId or proposalId is required");
  }
  const result = await client.query<ActivityRow>(
    `SELECT initiative_id, proposal_id, proposal_version_id, version_number, occurred_at, actor_id,
            kind, detail, source_table, source_id
     FROM proposal.activity
     WHERE ($1::uuid IS NULL OR initiative_id = $1::uuid)
       AND ($2::uuid IS NULL OR proposal_id = $2::uuid)
     ORDER BY occurred_at, proposal.activity_kind_order(kind), source_id
     LIMIT $3`,
    [query.initiativeId ?? null, query.proposalId ?? null, Math.max(1, Math.min(query.limit, 500))]
  );
  return result.rows.map((r) => ({
    initiativeId: r.initiative_id,
    proposalId: r.proposal_id,
    proposalVersionId: r.proposal_version_id,
    versionNumber: r.version_number,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    kind: r.kind,
    detail: r.detail,
    sourceTable: r.source_table,
    sourceId: r.source_id,
  }));
}
