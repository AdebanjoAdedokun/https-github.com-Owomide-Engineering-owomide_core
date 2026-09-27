import type { Subscriber, Subscription } from "@owomide/bus";
import { SUBSCRIBED_EVENT_TYPES } from "../domain/routing.js";
import { handleEvent, type HandlerDeps } from "../handlers/event-handler.js";
import type { Logger } from "../workers/email-sender.js";

/**
 * Subscribes to every event Notify handles. handleEvent is idempotent per (event, recipient), so
 * the bus's at-least-once delivery never creates a second notification or email. A handler error
 * is rethrown so the bus redelivers the event.
 */
export async function startNotificationSubscriber(
  subscriber: Subscriber,
  deps: HandlerDeps,
  logger: Logger,
): Promise<Subscription[]> {
  const subscriptions: Subscription[] = [];
  for (const topic of SUBSCRIBED_EVENT_TYPES) {
    subscriptions.push(
      await subscriber.subscribe(
        { topic, group: "notify.inapp", replayFrom: "beginning" },
        async (event) => {
          try {
            const result = await handleEvent(event, deps);
            logger.info(
              { eventId: event.id, eventType: event.type, ...result },
              "notifications stored",
            );
          } catch (err) {
            logger.error(
              { err, eventId: event.id, eventType: event.type },
              "notification handling failed",
            );
            throw err;
          }
        },
      ),
    );
  }
  return subscriptions;
}
