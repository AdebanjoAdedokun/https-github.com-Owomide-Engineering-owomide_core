import type pg from "pg";
import type { PoolClient } from "pg";
import type { Event, Publisher } from "@owomide/bus";
import type pino from "pino";

interface OutboxRow {
  id: string;
  event_type: string;
  partition_key: string;
  occurred_at: Date;
  payload: Buffer;
  attempts: number;
}

const BATCH_SIZE = 50;
const POLL_MS = 2_000;
const LEASE_SECONDS = 30;
const MAX_RETRY_SECONDS = 300;

function retrySeconds(attempts: number): number {
  return Math.min(2 ** attempts * 5, MAX_RETRY_SECONDS);
}

export class OutboxRelay {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly publisher: Publisher,
    private readonly logger: pino.Logger
  ) {}

  start(): void {
    this.running = true;
    void this.tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.publisher.close();
  }

  async runOnce(): Promise<void> {
    await this.processBatch();
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), POLL_MS);
  }

  private async tick(): Promise<void> {
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error({ err }, "outbox relay tick failed");
    } finally {
      this.schedule();
    }
  }

  private async processBatch(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<OutboxRow>(
        `SELECT * FROM proposal.claim_outbox_events($1, $2)`,
        [BATCH_SIZE, LEASE_SECONDS]
      );
      for (const row of rows) {
        await this.relay(client, row);
      }
    } finally {
      client.release();
    }
  }

  private async relay(client: PoolClient, row: OutboxRow): Promise<void> {
    const event: Event = {
      id: row.id,
      type: row.event_type,
      occurredAt: row.occurred_at.toISOString(),
      partitionKey: row.partition_key,
      payload: row.payload,
    };
    try {
      await this.publisher.publish(row.event_type, event);
      await client.query(`SELECT proposal.mark_outbox_published($1)`, [row.id]);
      this.logger.info({ eventType: row.event_type, outboxId: row.id }, "outbox event published");
    } catch (err) {
      const secs = retrySeconds(row.attempts);
      await client.query(`SELECT proposal.mark_outbox_failed($1, $2, $3)`, [
        row.id,
        err instanceof Error ? err.message : String(err),
        secs,
      ]);
      this.logger.warn(
        { eventType: row.event_type, outboxId: row.id, err, retrySecs: secs },
        "outbox event publish failed, will retry"
      );
    }
  }
}
