import type pg from "pg";
import { PROMPT_VERSION, type SummaryInput, type SummaryResult } from "../ai/proposal-summary.js";

// proposal.ai_suggestion (migration 0010). Runs inside a transaction that has set app.org_id.

export interface AiSuggestion {
  id: string;
  proposalVersionId: string;
  model: string;
  dataPolicy: string;
  outputText: string;
  requestedBy: string;
  createdAt: Date;
  appliedBy: string | null;
  appliedAt: Date | null;
  appliedText: string | null;
}

interface Row {
  id: string;
  proposal_version_id: string;
  model: string;
  data_policy: string;
  output_text: string;
  requested_by: string;
  created_at: Date;
  applied_by: string | null;
  applied_at: Date | null;
  applied_text: string | null;
}

const COLUMNS = `id, proposal_version_id, model, data_policy, output_text, requested_by, created_at,
                 applied_by, applied_at, applied_text`;

const toSuggestion = (r: Row): AiSuggestion => ({
  id: r.id,
  proposalVersionId: r.proposal_version_id,
  model: r.model,
  dataPolicy: r.data_policy,
  outputText: r.output_text,
  requestedBy: r.requested_by,
  createdAt: r.created_at,
  appliedBy: r.applied_by,
  appliedAt: r.applied_at,
  appliedText: r.applied_text,
});

export async function recordSummary(
  client: pg.ClientBase,
  args: {
    orgId: string;
    proposalVersionId: string;
    requestedBy: string;
    input: SummaryInput;
    result: SummaryResult;
  }
): Promise<AiSuggestion> {
  const { rows } = await client.query<Row>(
    `INSERT INTO proposal.ai_suggestion (org_id, proposal_version_id, kind, model, prompt_version,
       input_sha256, data_policy, output_text, requested_by)
     VALUES ($1, $2, 'proposal_summary', $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      args.orgId,
      args.proposalVersionId,
      args.result.model,
      PROMPT_VERSION,
      args.input.inputSha256,
      args.input.policy,
      args.result.text,
      args.requestedBy,
    ]
  );
  return toSuggestion(rows[0]!);
}

/**
 * A person applies a suggestion, optionally edited. Returns null when the suggestion does not
 * exist or was already applied; the database refuses a second apply.
 */
export async function applySuggestion(
  client: pg.ClientBase,
  args: { suggestionId: string; appliedBy: string; appliedText: string }
): Promise<AiSuggestion | null> {
  const text = args.appliedText.trim();
  if (!text) throw new Error("the applied text must not be empty");
  const { rows } = await client.query<Row>(
    `UPDATE proposal.ai_suggestion
     SET applied_by = $2, applied_at = clock_timestamp(), applied_text = $3
     WHERE id = $1 AND applied_at IS NULL
     RETURNING ${COLUMNS}`,
    [args.suggestionId, args.appliedBy, text]
  );
  return rows[0] ? toSuggestion(rows[0]) : null;
}

export async function listSuggestions(
  client: pg.ClientBase,
  proposalVersionId: string
): Promise<AiSuggestion[]> {
  const { rows } = await client.query<Row>(
    `SELECT ${COLUMNS} FROM proposal.ai_suggestion
     WHERE proposal_version_id = $1 ORDER BY created_at DESC, id`,
    [proposalVersionId]
  );
  return rows.map(toSuggestion);
}
