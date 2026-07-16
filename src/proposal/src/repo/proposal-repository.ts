import { Code, ConnectError } from "@connectrpc/connect";
import type { PoolClient } from "pg";
import type {
  CreateProposalRequest,
  ListProposalsRequest,
  ListCommentsRequest,
  ProposalLine,
  UpdateDraftRequest,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { ProposalState } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { decodeCursor, encodeCursor, pageSize } from "../domain/pagination.js";
import { type CommentRow, type ProposalLineRow, type ProposalRow } from "./mappers.js";

export interface ProposalWithLines {
  row: ProposalRow;
  lines: ProposalLineRow[];
}

export interface OutboxEventInput {
  id: string;
  orgId: string;
  eventType: string;
  aggregateId: string;
  partitionKey: string;
  payload: Uint8Array;
}

function dbState(s: ProposalState): string | null {
  switch (s) {
    case ProposalState.DRAFT:
      return "draft";
    case ProposalState.SUBMITTED:
      return "submitted";
    case ProposalState.BLOCKED:
      return "blocked";
    case ProposalState.APPROVED:
      return "approved";
    case ProposalState.PUBLISHED:
      return "published";
    default:
      return null;
  }
}

export class ProposalRepository {
  async createProposal(
    client: PoolClient,
    orgId: string,
    actorId: string,
    req: CreateProposalRequest
  ): Promise<ProposalWithLines> {
    const proposalResult = await client.query<ProposalRow>(
      `INSERT INTO proposal.proposal (org_id, state, actor_id, title)
       VALUES ($1, 'draft', $2, $3)
       RETURNING *`,
      [orgId, actorId, req.title]
    );
    const row = proposalResult.rows[0]!;

    let lines: ProposalLineRow[] = [];
    if (req.lines.length > 0) {
      const valuePlaceholders = req.lines
        .map((_: ProposalLine, i: number) => {
          const base = i * 8;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
        })
        .join(", ");
      const values = req.lines.flatMap((l: ProposalLine) => [
        orgId,
        row.id,
        l.skuId,
        l.channelId,
        String(l.currentPrice?.amount ?? 0),
        l.currentPrice?.currency ?? "",
        String(l.proposedPrice?.amount ?? 0),
        l.proposedPrice?.currency ?? "",
      ]);
      const linesResult = await client.query<ProposalLineRow>(
        `INSERT INTO proposal.proposal_line
           (org_id, proposal_id, sku_id, channel_id,
            current_price_minor, current_price_currency,
            proposed_price_minor, proposed_price_currency, reason)
         VALUES ${valuePlaceholders}
         RETURNING *`,
        values
      );
      lines = linesResult.rows;
    }

    await client.query(
      `INSERT INTO proposal.proposal_transition (org_id, proposal_id, from_state, to_state, actor_id, meta)
       VALUES ($1, $2, NULL, 'draft', $3, '{}'::jsonb)`,
      [orgId, row.id, actorId]
    );

    return { row, lines };
  }

  async getProposal(client: PoolClient, id: string): Promise<ProposalWithLines | null> {
    const proposalResult = await client.query<ProposalRow>(
      `SELECT * FROM proposal.proposal
       WHERE id = $1 AND org_id = proposal.current_org_id()`,
      [id]
    );
    const row = proposalResult.rows[0];
    if (!row) return null;

    const linesResult = await client.query<ProposalLineRow>(
      `SELECT * FROM proposal.proposal_line WHERE proposal_id = $1 ORDER BY id`,
      [id]
    );
    return { row, lines: linesResult.rows };
  }

  async updateDraft(
    client: PoolClient,
    id: string,
    req: UpdateDraftRequest
  ): Promise<ProposalWithLines> {
    const stateResult = await client.query<{ state: string }>(
      `SELECT state FROM proposal.proposal WHERE id = $1`,
      [id]
    );
    const current = stateResult.rows[0];
    if (!current) {
      throw new ConnectError("Proposal not found", Code.NotFound);
    }
    if (current.state !== "draft") {
      throw new ConnectError(
        `Proposal is in state '${current.state}' and cannot be updated`,
        Code.FailedPrecondition
      );
    }

    const proposalResult = await client.query<ProposalRow>(
      `UPDATE proposal.proposal SET title = $1, updated_at = clock_timestamp() WHERE id = $2 RETURNING *`,
      [req.title, id]
    );
    const row = proposalResult.rows[0]!;

    await client.query(`DELETE FROM proposal.proposal_line WHERE proposal_id = $1`, [id]);

    let lines: ProposalLineRow[] = [];
    if (req.lines.length > 0) {
      const valuePlaceholders = req.lines
        .map((_: ProposalLine, i: number) => {
          const base = i * 9;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
        })
        .join(", ");
      const values = req.lines.flatMap((l: ProposalLine) => [
        row.org_id,
        id,
        l.skuId,
        l.channelId,
        String(l.currentPrice?.amount ?? 0),
        l.currentPrice?.currency ?? "",
        String(l.proposedPrice?.amount ?? 0),
        l.proposedPrice?.currency ?? "",
        l.reason,
      ]);
      const linesResult = await client.query<ProposalLineRow>(
        `INSERT INTO proposal.proposal_line
           (org_id, proposal_id, sku_id, channel_id,
            current_price_minor, current_price_currency,
            proposed_price_minor, proposed_price_currency, reason)
         VALUES ${valuePlaceholders}
         RETURNING *`,
        values
      );
      lines = linesResult.rows;
    }

    return { row, lines };
  }

  async submitProposal(
    client: PoolClient,
    id: string,
    fromState: string,
    nextState: "submitted" | "blocked",
    actorId: string,
    meta: Record<string, unknown>
  ): Promise<ProposalWithLines> {
    // Guard against TOCTOU: only update if state hasn't changed since we read it
    const proposalResult = await client.query<ProposalRow>(
      `UPDATE proposal.proposal
       SET state = $1, updated_at = clock_timestamp()
       WHERE id = $2 AND state = $3 AND org_id = proposal.current_org_id()
       RETURNING *`,
      [nextState, id, fromState]
    );
    const row = proposalResult.rows[0];
    if (!row) {
      throw new ConnectError(
        "Proposal state changed concurrently or was not found",
        Code.FailedPrecondition
      );
    }

    await client.query(
      `INSERT INTO proposal.proposal_transition (org_id, proposal_id, from_state, to_state, actor_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [row.org_id, id, fromState, nextState, actorId, JSON.stringify(meta)]
    );

    const linesResult = await client.query<ProposalLineRow>(
      `SELECT * FROM proposal.proposal_line WHERE proposal_id = $1 ORDER BY id`,
      [id]
    );

    return { row, lines: linesResult.rows };
  }

  async approveProposal(
    client: PoolClient,
    id: string,
    fromState: string,
    actorId: string,
    meta: Record<string, unknown>
  ): Promise<ProposalWithLines> {
    const proposalResult = await client.query<ProposalRow>(
      `UPDATE proposal.proposal
       SET state = 'approved', updated_at = clock_timestamp()
       WHERE id = $1 AND state = $2 AND org_id = proposal.current_org_id()
       RETURNING *`,
      [id, fromState]
    );
    const row = proposalResult.rows[0];
    if (!row) {
      throw new ConnectError(
        "Proposal state changed concurrently or was not found",
        Code.FailedPrecondition
      );
    }

    await client.query(
      `INSERT INTO proposal.proposal_transition (org_id, proposal_id, from_state, to_state, actor_id, meta)
       VALUES ($1, $2, $3, 'approved', $4, $5::jsonb)`,
      [row.org_id, id, fromState, actorId, JSON.stringify(meta)]
    );

    const linesResult = await client.query<ProposalLineRow>(
      `SELECT * FROM proposal.proposal_line WHERE proposal_id = $1 ORDER BY id`,
      [id]
    );

    return { row, lines: linesResult.rows };
  }

  async publishProposal(
    client: PoolClient,
    id: string,
    fromState: string,
    actorId: string,
    meta: Record<string, unknown>
  ): Promise<ProposalWithLines> {
    const proposalResult = await client.query<ProposalRow>(
      `UPDATE proposal.proposal
       SET state = 'published', updated_at = clock_timestamp()
       WHERE id = $1 AND state = $2 AND org_id = proposal.current_org_id()
       RETURNING *`,
      [id, fromState]
    );
    const row = proposalResult.rows[0];
    if (!row) {
      throw new ConnectError(
        "Proposal state changed concurrently or was not found",
        Code.FailedPrecondition
      );
    }

    await client.query(
      `INSERT INTO proposal.proposal_transition (org_id, proposal_id, from_state, to_state, actor_id, meta)
       VALUES ($1, $2, $3, 'published', $4, $5::jsonb)`,
      [row.org_id, id, fromState, actorId, JSON.stringify(meta)]
    );

    const linesResult = await client.query<ProposalLineRow>(
      `SELECT * FROM proposal.proposal_line WHERE proposal_id = $1 ORDER BY id`,
      [id]
    );

    return { row, lines: linesResult.rows };
  }

  async insertOutboxEvent(client: PoolClient, event: OutboxEventInput): Promise<void> {
    await client.query(
      `INSERT INTO proposal.outbox_event
         (id, org_id, event_type, aggregate_type, aggregate_id, partition_key, payload, metadata, occurred_at)
       VALUES ($1, $2, $3, 'proposal', $4, $5, $6, '{}'::jsonb, clock_timestamp())`,
      [
        event.id,
        event.orgId,
        event.eventType,
        event.aggregateId,
        event.partitionKey,
        Buffer.from(event.payload),
      ]
    );
  }

  async listProposals(
    client: PoolClient,
    req: ListProposalsRequest
  ): Promise<{ proposals: ProposalWithLines[]; nextPageToken: string; totalCount: number }> {
    const limit = pageSize(req.pagination?.pageSize ?? 0);
    const cursor = decodeCursor(req.pagination?.pageToken ?? "");

    const conditions: string[] = [];
    const values: unknown[] = [];

    const stateFilter = dbState(req.state);
    if (stateFilter !== null) {
      conditions.push(`state = $${values.length + 1}`);
      values.push(stateFilter);
    }
    if (req.actorId) {
      conditions.push(`actor_id = $${values.length + 1}`);
      values.push(req.actorId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM proposal.proposal ${whereClause}`,
      values
    );
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const cursorConditions = [...conditions];
    const cursorValues = [...values];
    if (cursor) {
      cursorConditions.push(
        `(created_at, id) < ($${cursorValues.length + 1}::timestamptz, $${cursorValues.length + 2}::uuid)`
      );
      cursorValues.push(cursor.key, cursor.id);
    }
    const dataWhereClause =
      cursorConditions.length > 0 ? `WHERE ${cursorConditions.join(" AND ")}` : "";

    const dataResult = await client.query<ProposalRow>(
      `SELECT * FROM proposal.proposal ${dataWhereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${cursorValues.length + 1}`,
      [...cursorValues, limit + 1]
    );

    const rows = dataResult.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    let nextPageToken = "";
    if (hasMore) {
      const last = pageRows[pageRows.length - 1]!;
      nextPageToken = encodeCursor({
        key: last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at),
        id: last.id,
      });
    }

    if (pageRows.length === 0) {
      return { proposals: [], nextPageToken, totalCount };
    }

    const proposalIds = pageRows.map((r) => r.id);
    const linesResult = await client.query<ProposalLineRow>(
      `SELECT * FROM proposal.proposal_line WHERE proposal_id = ANY($1::uuid[]) ORDER BY proposal_id, id`,
      [proposalIds]
    );

    const linesByProposal = new Map<string, ProposalLineRow[]>();
    for (const line of linesResult.rows) {
      const group = linesByProposal.get(line.proposal_id) ?? [];
      group.push(line);
      linesByProposal.set(line.proposal_id, group);
    }

    const proposals = pageRows.map((row) => ({
      row,
      lines: linesByProposal.get(row.id) ?? [],
    }));

    return { proposals, nextPageToken, totalCount };
  }

  async addComment(
    client: PoolClient,
    proposalId: string,
    orgId: string,
    authorId: string,
    body: string
  ): Promise<CommentRow> {
    const result = await client.query<CommentRow>(
      `INSERT INTO proposal.proposal_comment (org_id, proposal_id, author_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, proposalId, authorId, body]
    );
    return result.rows[0]!;
  }

  async listComments(
    client: PoolClient,
    proposalId: string,
    req: ListCommentsRequest
  ): Promise<{ comments: CommentRow[]; nextPageToken: string; totalCount: number }> {
    const limit = pageSize(req.pagination?.pageSize ?? 0);
    const cursor = decodeCursor(req.pagination?.pageToken ?? "");

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM proposal.proposal_comment WHERE proposal_id = $1`,
      [proposalId]
    );
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const values: unknown[] = [proposalId];
    let cursorClause = "";
    if (cursor) {
      cursorClause = `AND (occurred_at, id) < ($${values.length + 1}::timestamptz, $${values.length + 2}::uuid)`;
      values.push(cursor.key, cursor.id);
    }

    const dataResult = await client.query<CommentRow>(
      `SELECT * FROM proposal.proposal_comment
       WHERE proposal_id = $1 ${cursorClause}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${values.length + 1}`,
      [...values, limit + 1]
    );

    const rows = dataResult.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    let nextPageToken = "";
    if (hasMore) {
      const last = pageRows[pageRows.length - 1]!;
      nextPageToken = encodeCursor({
        key: last.occurred_at instanceof Date ? last.occurred_at.toISOString() : String(last.occurred_at),
        id: last.id,
      });
    }

    return { comments: pageRows, nextPageToken, totalCount };
  }
}
