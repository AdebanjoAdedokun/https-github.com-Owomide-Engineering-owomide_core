import type pg from "pg";
import type pino from "pino";
import type { Subscriber, Subscription } from "@owomide/bus";
import { mapEventToAuditRow, SUBSCRIBED_TOPICS } from "../domain/event-mapper.js";
import { insertAuditRow } from "../repo/audit-repo.js";

export async function startAuditSubscriber(
  subscriber: Subscriber,
  pool: pg.Pool,
  logger: pino.Logger,
): Promise<Subscription[]> {
  const subscriptions: Subscription[] = [];

  for (const topic of SUBSCRIBED_TOPICS) {
    const sub = await subscriber.subscribe(
      { topic, group: "governance.audit", replayFrom: "beginning" },
      async (event) => {
        try {
          const row = mapEventToAuditRow(event);
          const inserted = await insertAuditRow(pool, row);
          if (inserted) {
            logger.info({ eventId: event.id, eventType: event.type }, "audit row inserted");
          } else {
            logger.debug({ eventId: event.id }, "duplicate event skipped");
          }
        } catch (err) {
          logger.error({ err, eventId: event.id, eventType: event.type }, "audit ingest failed");
          throw err;
        }
      },
    );
    subscriptions.push(sub);
  }

  logger.info({ topics: SUBSCRIBED_TOPICS }, "audit subscriber started");
  return subscriptions;
}
