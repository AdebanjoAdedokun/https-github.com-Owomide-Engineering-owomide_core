import type pg from "pg";
import type { EmailSender } from "../clients/zeptomail.js";
import { EmailSendError } from "../clients/zeptomail.js";

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface EmailWorkerOptions {
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
}

interface ClaimedRow {
  id: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  attempts: number;
}

export interface BatchResult {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Sends queued emails. Claims a batch across tenants through notify.claim_email_deliveries (a
 * lease, so two workers never send the same email), sends each one, and records the outcome.
 * A retryable failure backs off; a permanent one stops at once. Never throws for one bad email.
 */
export class EmailWorker {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sender: EmailSender,
    private readonly logger: Logger,
    private readonly options: EmailWorkerOptions,
  ) {}

  async runOnce(): Promise<BatchResult> {
    const { rows } = await this.pool.query<ClaimedRow>(
      `SELECT id, recipient_email, subject, body_text, attempts
       FROM notify.claim_email_deliveries($1, $2)`,
      [this.options.batchSize, this.options.leaseSeconds],
    );
    const result: BatchResult = {
      claimed: rows.length,
      sent: 0,
      retrying: 0,
      failed: 0,
    };
    for (const row of rows) {
      try {
        const { providerMessageId } = await this.sender.send({
          to: row.recipient_email,
          subject: row.subject,
          text: row.body_text,
        });
        await this.pool.query(`SELECT notify.mark_email_sent($1, $2)`, [
          row.id,
          providerMessageId,
        ]);
        result.sent += 1;
      } catch (error) {
        const permanent = error instanceof EmailSendError && error.permanent;
        const message = error instanceof Error ? error.message : String(error);
        // A permanent failure is recorded with an attempt limit of 0, which marks it failed now.
        await this.pool.query(`SELECT notify.mark_email_failed($1, $2, $3)`, [
          row.id,
          message,
          permanent ? 0 : this.options.maxAttempts,
        ]);
        const gaveUp = permanent || row.attempts >= this.options.maxAttempts;
        if (gaveUp) result.failed += 1;
        else result.retrying += 1;
        // The recipient address is personal data; log the delivery id only.
        this.logger.warn(
          { deliveryId: row.id, permanent, gaveUp, error: message },
          "email not sent",
        );
      }
    }
    return result;
  }

  /** Polls until the signal aborts. Errors in one round are logged and the loop continues. */
  async run(pollMs: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let claimed = 0;
      try {
        const result = await this.runOnce();
        claimed = result.claimed;
        if (claimed > 0) this.logger.info(result, "email batch processed");
      } catch (error) {
        this.logger.error({ err: error }, "email batch failed");
      }
      if (claimed < this.options.batchSize) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, pollMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  }
}
