import type { Database } from "../db.js";
import { decodeEvent, type IncomingEvent } from "../domain/decode.js";
import {
  channelsFor,
  resolveRecipients,
  type RecipientDirectory,
} from "../domain/routing.js";
import { render } from "../domain/templates.js";
import {
  getParticipants,
  getPreferences,
  insertNotification,
  recordApprover,
  recordSubmitter,
} from "../repo/notification-repo.js";

export interface HandlerDeps {
  db: Database;
  directory: RecipientDirectory;
  /** Workspace origin used for links in emails, e.g. https://app.owomide.com */
  appBaseUrl: string;
}

export interface HandleResult {
  recipients: number;
  created: number;
}

/**
 * Turns one bus event into notifications. Safe to call again with the same event: each
 * (event, recipient) pair is stored once, so a redelivery creates nothing new and sends no
 * second email. Returns null for event types Notify does not handle.
 */
export async function handleEvent(
  event: IncomingEvent,
  deps: HandlerDeps,
): Promise<HandleResult | null> {
  const facts = decodeEvent(event);
  if (!facts) return null;
  const rendered = render(facts, deps.appBaseUrl);

  return deps.db.withOrgTransaction(facts.orgId, async (client) => {
    if (facts.type === "proposal.submitted") {
      await recordSubmitter(
        client,
        facts.orgId,
        facts.entityId,
        facts.actorId,
        facts.eventId,
      );
    } else if (facts.type === "proposal.approved" && facts.approverId) {
      await recordApprover(
        client,
        facts.entityId,
        facts.approverId,
        facts.eventId,
      );
    }
    const participants =
      facts.entityType === "proposal"
        ? await getParticipants(client, facts.entityId)
        : null;
    const recipients = await resolveRecipients(
      facts,
      participants,
      deps.directory,
    );
    if (recipients.length === 0) return { recipients: 0, created: 0 };

    const preferences = await getPreferences(client, recipients, facts.type);
    const emails = await deps.directory.emailAddresses(facts.orgId, recipients);
    let created = 0;
    for (const recipient of recipients) {
      const channels = channelsFor(facts.type, preferences.get(recipient));
      const email = channels.email ? emails.get(recipient) : undefined;
      if (!channels.inApp && !email) continue;
      const inserted = await insertNotification(client, {
        orgId: facts.orgId,
        recipientUserId: recipient,
        sourceEventId: facts.eventId,
        eventType: facts.type,
        entityType: facts.entityType,
        entityId: facts.entityId,
        title: rendered.title,
        body: rendered.body,
        linkPath: rendered.linkPath,
        showInApp: channels.inApp,
        email: email
          ? {
              to: email,
              subject: rendered.emailSubject,
              text: rendered.emailText,
            }
          : null,
      });
      if (inserted) created += 1;
    }
    return { recipients: recipients.length, created };
  });
}
