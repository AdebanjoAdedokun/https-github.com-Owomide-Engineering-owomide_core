import type { Publisher } from "@owomide/bus";
import type { Database } from "./db.js";

interface OutboxRow {
  id: string;
  event_type: string;
  partition_key: string;
  payload: Buffer;
  metadata: { correlation_id?: string };
  occurred_at: Date;
  attempts: number;
}

export class OutboxWorker {
  constructor(
    private readonly database: Database,
    private readonly publisher: Publisher,
    private readonly batchSize: number
  ) {}

  async runOnce(): Promise<number> {
    const claimed = await this.database.query<OutboxRow>(
      "SELECT * FROM catalog.claim_outbox_events($1, 30)",
      [this.batchSize]
    );
    for (const row of claimed.rows) {
      try {
        await this.publisher.publish(row.event_type, {
          id: row.id,
          type: row.event_type,
          occurredAt: row.occurred_at.toISOString(),
          partitionKey: row.partition_key,
          payload: new Uint8Array(row.payload),
          metadata: row.metadata.correlation_id
            ? { correlationId: row.metadata.correlation_id }
            : undefined,
        });
        await this.database.query("SELECT catalog.mark_outbox_published($1)", [row.id]);
      } catch (error) {
        const retrySeconds = Math.min(300, 2 ** Math.min(row.attempts, 8));
        const message = error instanceof Error ? error.message : String(error);
        await this.database.query("SELECT catalog.mark_outbox_failed($1, $2, $3)", [
          row.id,
          message,
          retrySeconds,
        ]);
      }
    }
    return claimed.rowCount ?? 0;
  }
}
