import type pg from "pg";
import type { AuditLogRow } from "../domain/event-mapper.js";

export async function insertAuditRow(pool: pg.Pool, row: AuditLogRow): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.org_id', $1, true)`, [row.orgId]);
    const result = await client.query(
      `INSERT INTO governance.audit_log
         (org_id, event_id, event_type, entity_type, entity_id, actor_id, occurred_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        row.orgId,
        row.eventId,
        row.eventType,
        row.entityType,
        row.entityId,
        row.actorId,
        row.occurredAt,
        JSON.stringify(row.payload),
      ],
    );
    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
