import type pg from "pg";

export interface SnapshotRow {
  id: string;
  orgId: string;
  snapshotAt: Date;
  scope: string;
  storageUrl: string;
  rowCounts: Record<string, number>;
  checksum: string;
  createdAt: Date;
}

export async function insertSnapshot(
  pool: pg.Pool,
  row: {
    id: string;
    orgId: string;
    snapshotAt: string;
    scope: string;
    storageUrl: string;
    rowCounts: Record<string, number>;
    checksum: string;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [row.orgId]);
    await client.query(
      `INSERT INTO governance.snapshot
         (id, org_id, snapshot_at, scope, storage_url, row_counts, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.id,
        row.orgId,
        row.snapshotAt,
        row.scope,
        row.storageUrl,
        JSON.stringify(row.rowCounts),
        row.checksum,
      ],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLatestSnapshot(
  pool: pg.Pool,
  orgId: string,
): Promise<SnapshotRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const { rows } = await client.query<{
      id: string;
      org_id: string;
      snapshot_at: Date;
      scope: string;
      storage_url: string;
      row_counts: Record<string, number>;
      checksum: string;
      created_at: Date;
    }>(
      `SELECT id, org_id, snapshot_at, scope, storage_url, row_counts, checksum, created_at
       FROM governance.snapshot
       WHERE org_id = $1
       ORDER BY snapshot_at DESC
       LIMIT 1`,
      [orgId],
    );
    await client.query("COMMIT");
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      orgId: r.org_id,
      snapshotAt: r.snapshot_at,
      scope: r.scope,
      storageUrl: r.storage_url,
      rowCounts: r.row_counts,
      checksum: r.checksum,
      createdAt: r.created_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getSnapshotById(
  pool: pg.Pool,
  orgId: string,
  snapshotId: string,
): Promise<SnapshotRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const { rows } = await client.query<{
      id: string;
      org_id: string;
      snapshot_at: Date;
      scope: string;
      storage_url: string;
      row_counts: Record<string, number>;
      checksum: string;
      created_at: Date;
    }>(
      `SELECT id, org_id, snapshot_at, scope, storage_url, row_counts, checksum, created_at
       FROM governance.snapshot
       WHERE id = $1 AND org_id = $2`,
      [snapshotId, orgId],
    );
    await client.query("COMMIT");
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      orgId: r.org_id,
      snapshotAt: r.snapshot_at,
      scope: r.scope,
      storageUrl: r.storage_url,
      rowCounts: r.row_counts,
      checksum: r.checksum,
      createdAt: r.created_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listSnapshots(
  pool: pg.Pool,
  orgId: string,
  limit: number,
  offset: number,
): Promise<{ rows: SnapshotRow[]; total: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const countResult = await client.query<{ cnt: number }>(
      "SELECT count(*)::int AS cnt FROM governance.snapshot WHERE org_id = $1",
      [orgId],
    );
    const total = countResult.rows[0]!.cnt;
    const { rows } = await client.query<{
      id: string;
      org_id: string;
      snapshot_at: Date;
      scope: string;
      storage_url: string;
      row_counts: Record<string, number>;
      checksum: string;
      created_at: Date;
    }>(
      `SELECT id, org_id, snapshot_at, scope, storage_url, row_counts, checksum, created_at
       FROM governance.snapshot
       WHERE org_id = $1
       ORDER BY snapshot_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    );
    await client.query("COMMIT");
    return {
      rows: rows.map((r) => ({
        id: r.id,
        orgId: r.org_id,
        snapshotAt: r.snapshot_at,
        scope: r.scope,
        storageUrl: r.storage_url,
        rowCounts: r.row_counts,
        checksum: r.checksum,
        createdAt: r.created_at,
      })),
      total,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
