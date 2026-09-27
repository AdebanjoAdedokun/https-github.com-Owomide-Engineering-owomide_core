import type pg from "pg";
import type {
  ChannelPreference,
  EventType,
  Participants,
} from "../domain/routing.js";

// Every function runs inside a transaction that has already set app.org_id (see db.ts), so
// forced row-level security scopes each statement to one organisation.

export interface NewNotification {
  orgId: string;
  recipientUserId: string;
  sourceEventId: string;
  eventType: EventType;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  linkPath: string;
  showInApp: boolean;
  email: { to: string; subject: string; text: string } | null;
}

/** Inserts a notification (and its email) once per (event, recipient). Returns false on replay. */
export async function insertNotification(
  client: pg.ClientBase,
  n: NewNotification,
): Promise<boolean> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO notify.notification (org_id, recipient_user_id, source_event_id, event_type,
       entity_type, entity_id, title, body, link_path, show_in_app)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (org_id, source_event_id, recipient_user_id) DO NOTHING
     RETURNING id`,
    [
      n.orgId,
      n.recipientUserId,
      n.sourceEventId,
      n.eventType,
      n.entityType,
      n.entityId,
      n.title,
      n.body,
      n.linkPath,
      n.showInApp,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) return false;
  if (n.email) {
    await client.query(
      `INSERT INTO notify.email_delivery (org_id, notification_id, recipient_email, subject, body_text)
       VALUES ($1, $2, $3, $4, $5)`,
      [n.orgId, id, n.email.to, n.email.subject, n.email.text],
    );
  }
  return true;
}

export async function getParticipants(
  client: pg.ClientBase,
  proposalId: string,
): Promise<Participants | null> {
  const result = await client.query<{
    submitter_user_id: string;
    approver_user_id: string | null;
  }>(
    `SELECT submitter_user_id, approver_user_id FROM notify.proposal_participant WHERE proposal_id = $1`,
    [proposalId],
  );
  const row = result.rows[0];
  return row
    ? {
        submitterUserId: row.submitter_user_id,
        approverUserId: row.approver_user_id,
      }
    : null;
}

/** A (re)submission records its submitter and clears any earlier decision-maker. */
export async function recordSubmitter(
  client: pg.ClientBase,
  orgId: string,
  proposalId: string,
  submitterUserId: string,
  eventId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notify.proposal_participant (org_id, proposal_id, submitter_user_id, updated_from_event_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, proposal_id) DO UPDATE
     SET submitter_user_id = EXCLUDED.submitter_user_id, approver_user_id = NULL,
         updated_from_event_id = EXCLUDED.updated_from_event_id, updated_at = clock_timestamp()`,
    [orgId, proposalId, submitterUserId, eventId],
  );
}

export async function recordApprover(
  client: pg.ClientBase,
  proposalId: string,
  approverUserId: string,
  eventId: string,
): Promise<void> {
  await client.query(
    `UPDATE notify.proposal_participant
     SET approver_user_id = $2, updated_from_event_id = $3, updated_at = clock_timestamp()
     WHERE proposal_id = $1`,
    [proposalId, approverUserId, eventId],
  );
}

export async function getPreferences(
  client: pg.ClientBase,
  userIds: readonly string[],
  eventType: EventType,
): Promise<Map<string, ChannelPreference>> {
  const result = await client.query<{
    user_id: string;
    email_enabled: boolean;
    in_app_enabled: boolean;
  }>(
    `SELECT user_id, email_enabled, in_app_enabled FROM notify.notification_preference
     WHERE event_type = $1 AND user_id = ANY($2::text[])`,
    [eventType, userIds],
  );
  return new Map(
    result.rows.map((r) => [
      r.user_id,
      { emailEnabled: r.email_enabled, inAppEnabled: r.in_app_enabled },
    ]),
  );
}

export async function setPreference(
  client: pg.ClientBase,
  orgId: string,
  userId: string,
  eventType: EventType,
  preference: ChannelPreference,
): Promise<void> {
  await client.query(
    `INSERT INTO notify.notification_preference (org_id, user_id, event_type, email_enabled, in_app_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, user_id, event_type) DO UPDATE
     SET email_enabled = EXCLUDED.email_enabled, in_app_enabled = EXCLUDED.in_app_enabled,
         updated_at = clock_timestamp()`,
    [
      orgId,
      userId,
      eventType,
      preference.emailEnabled,
      preference.inAppEnabled,
    ],
  );
}

export interface InboxItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  linkPath: string | null;
  createdAt: Date;
  readAt: Date | null;
}

/** The recipient's in-app inbox, newest first, keyset-paged by (created_at, id). */
export async function listInbox(
  client: pg.ClientBase,
  userId: string,
  limit: number,
  before?: { createdAt: Date; id: string },
): Promise<InboxItem[]> {
  const result = await client.query<{
    id: string;
    event_type: string;
    title: string;
    body: string;
    link_path: string | null;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT id, event_type, title, body, link_path, created_at, read_at
     FROM notify.notification
     WHERE recipient_user_id = $1 AND show_in_app
       AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [
      userId,
      Math.max(1, Math.min(limit, 100)),
      before?.createdAt ?? null,
      before?.id ?? null,
    ],
  );
  return result.rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    title: r.title,
    body: r.body,
    linkPath: r.link_path,
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
}

export async function unreadCount(
  client: pg.ClientBase,
  userId: string,
): Promise<number> {
  const result = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notify.notification
     WHERE recipient_user_id = $1 AND show_in_app AND read_at IS NULL`,
    [userId],
  );
  return result.rows[0]?.n ?? 0;
}

/** Marks the caller's own notifications read. Other people's ids are ignored. */
export async function markRead(
  client: pg.ClientBase,
  userId: string,
  ids: readonly string[],
): Promise<number> {
  const result = await client.query(
    `UPDATE notify.notification SET read_at = clock_timestamp()
     WHERE recipient_user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [userId, ids],
  );
  return result.rowCount ?? 0;
}
