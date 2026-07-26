import type pg from "pg";

export interface RestoreRequestRow {
  id: string;
  orgId: string;
  requestedBy: string;
  snapshotId: string;
  targetTimestamp: Date;
  targetEnvironment: string;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  approvalId: string | null;
}

export async function insertRestoreRequest(
  pool: pg.Pool,
  row: {
    orgId: string;
    requestedBy: string;
    snapshotId: string;
    targetTimestamp: Date;
    targetEnvironment: string;
    approvalId?: string;
  },
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [row.orgId]);
    const result = await client.query<{ id: string }>(
      `INSERT INTO governance.restore_request
         (org_id, requested_by, snapshot_id, target_timestamp, target_environment, approval_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        row.orgId,
        row.requestedBy,
        row.snapshotId,
        row.targetTimestamp,
        row.targetEnvironment,
        row.approvalId ?? null,
      ],
    );
    await client.query("COMMIT");
    return result.rows[0]!.id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRestoreStatus(
  pool: pg.Pool,
  orgId: string,
  restoreId: string,
  status: "running" | "completed" | "failed",
  errorMessage?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const isTerminal = status === "completed" || status === "failed";
    await client.query(
      `UPDATE governance.restore_request
       SET status = $1,
           error_message = $2,
           completed_at = CASE WHEN $3 THEN clock_timestamp() ELSE completed_at END
       WHERE id = $4 AND org_id = $5`,
      [status, errorMessage ?? null, isTerminal, restoreId, orgId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getRestoreRequest(
  pool: pg.Pool,
  orgId: string,
  restoreId: string,
): Promise<RestoreRequestRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const { rows } = await client.query<{
      id: string;
      org_id: string;
      requested_by: string;
      snapshot_id: string;
      target_timestamp: Date;
      target_environment: string;
      status: "pending" | "running" | "completed" | "failed";
      error_message: string | null;
      requested_at: Date;
      completed_at: Date | null;
      approval_id: string | null;
    }>(
      `SELECT id, org_id, requested_by, snapshot_id, target_timestamp, target_environment,
              status, error_message, requested_at, completed_at, approval_id
       FROM governance.restore_request
       WHERE id = $1 AND org_id = $2`,
      [restoreId, orgId],
    );
    await client.query("COMMIT");
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      orgId: r.org_id,
      requestedBy: r.requested_by,
      snapshotId: r.snapshot_id,
      targetTimestamp: r.target_timestamp,
      targetEnvironment: r.target_environment,
      status: r.status,
      errorMessage: r.error_message,
      requestedAt: r.requested_at,
      completedAt: r.completed_at,
      approvalId: r.approval_id,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
