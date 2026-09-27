-- Migration: 0002_notifications
-- Service: notify
-- PostgreSQL 16+
--
-- In-app notifications, per-user channel preferences, an email delivery queue and a small
-- projection of who submitted and who decided each Proposal (events do not repeat the submitter).
-- Every table is tenant-scoped with forced row-level security. Delivery is idempotent: one
-- notification per (source event, recipient), one email per notification.

CREATE FUNCTION notify.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

-- In-app inbox -----------------------------------------------------------------------------------

CREATE TABLE notify.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  recipient_user_id text NOT NULL CHECK (btrim(recipient_user_id) <> ''),
  source_event_id text NOT NULL CHECK (btrim(source_event_id) <> ''),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text NOT NULL CHECK (btrim(entity_type) <> ''),
  entity_id text NOT NULL CHECK (btrim(entity_id) <> ''),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  body text NOT NULL CHECK (length(body) <= 2000),
  link_path text CHECK (link_path IS NULL OR link_path ~ '^/[A-Za-z0-9/_\-]*$'),
  show_in_app boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, source_event_id, recipient_user_id),
  CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX notification_inbox_idx
  ON notify.notification (org_id, recipient_user_id, created_at DESC, id)
  WHERE show_in_app;
CREATE INDEX notification_unread_idx
  ON notify.notification (org_id, recipient_user_id)
  WHERE show_in_app AND read_at IS NULL;

-- A notification's content never changes; the only update is marking it read, once.
CREATE FUNCTION notify.guard_notification_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
    RAISE EXCEPTION 'notifications are immutable apart from read_at'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'a notification is marked read only once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_guard_update
BEFORE UPDATE ON notify.notification
FOR EACH ROW EXECUTE FUNCTION notify.guard_notification_update();

-- Preferences ------------------------------------------------------------------------------------

CREATE TABLE notify.notification_preference (
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  user_id text NOT NULL CHECK (btrim(user_id) <> ''),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  email_enabled boolean NOT NULL,
  in_app_enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (org_id, user_id, event_type)
);

-- Email queue ------------------------------------------------------------------------------------

CREATE TABLE notify.email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  notification_id uuid NOT NULL,
  recipient_email text NOT NULL CHECK (recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text NOT NULL CHECK (btrim(subject) <> '' AND length(subject) <= 200),
  body_text text NOT NULL CHECK (length(body_text) <= 10000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (notification_id),
  FOREIGN KEY (org_id, notification_id) REFERENCES notify.notification (org_id, id),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX email_delivery_pending_idx
  ON notify.email_delivery (available_at, created_at, id)
  WHERE status = 'pending';

-- The sender works across tenants, so it leases and settles deliveries only through these
-- narrow SECURITY DEFINER functions, never through direct table access.
CREATE FUNCTION notify.claim_email_deliveries(p_limit integer, p_lease_seconds integer DEFAULT 60)
RETURNS SETOF notify.email_delivery
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, notify
AS $$
  WITH claimed AS (
    SELECT id
    FROM notify.email_delivery
    WHERE status = 'pending' AND available_at <= clock_timestamp()
    ORDER BY available_at, created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 200))
  )
  UPDATE notify.email_delivery AS d
  SET attempts = d.attempts + 1,
      available_at = clock_timestamp() + make_interval(secs => GREATEST(1, p_lease_seconds))
  FROM claimed
  WHERE d.id = claimed.id
  RETURNING d.*;
$$;

CREATE FUNCTION notify.mark_email_sent(p_id uuid, p_provider_message_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, notify
AS $$
  UPDATE notify.email_delivery
  SET status = 'sent', sent_at = clock_timestamp(), provider_message_id = p_provider_message_id,
      last_error = NULL
  WHERE id = p_id AND status = 'pending';
$$;

-- Retries with exponential backoff (1, 2, 4 ... minutes, capped at one hour) and gives up after
-- p_max_attempts. A failed email never affects the in-app notification or any upstream flow.
CREATE FUNCTION notify.mark_email_failed(p_id uuid, p_error text, p_max_attempts integer DEFAULT 8)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, notify
AS $$
  UPDATE notify.email_delivery
  SET last_error = left(p_error, 2000),
      status = CASE WHEN attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
      available_at = clock_timestamp()
        + make_interval(secs => LEAST(3600, 60 * power(2, GREATEST(attempts - 1, 0))::integer))
  WHERE id = p_id AND status = 'pending';
$$;

-- Proposal participants (projection) -------------------------------------------------------------

CREATE TABLE notify.proposal_participant (
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id text NOT NULL CHECK (btrim(proposal_id) <> ''),
  submitter_user_id text NOT NULL CHECK (btrim(submitter_user_id) <> ''),
  approver_user_id text,
  updated_from_event_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (org_id, proposal_id)
);

-- Row-level security ------------------------------------------------------------------------------

ALTER TABLE notify.notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.notification FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_preference FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.email_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.email_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.proposal_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.proposal_participant FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_tenant_policy ON notify.notification
  USING (org_id = notify.current_org_id()) WITH CHECK (org_id = notify.current_org_id());
CREATE POLICY notification_preference_tenant_policy ON notify.notification_preference
  USING (org_id = notify.current_org_id()) WITH CHECK (org_id = notify.current_org_id());
CREATE POLICY email_delivery_tenant_policy ON notify.email_delivery
  USING (org_id = notify.current_org_id()) WITH CHECK (org_id = notify.current_org_id());
CREATE POLICY proposal_participant_tenant_policy ON notify.proposal_participant
  USING (org_id = notify.current_org_id()) WITH CHECK (org_id = notify.current_org_id());

REVOKE ALL ON FUNCTION notify.claim_email_deliveries(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify.mark_email_sent(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify.mark_email_failed(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION notify.current_org_id() TO notify_svc;
GRANT SELECT, INSERT ON notify.notification TO notify_svc;
GRANT UPDATE (read_at) ON notify.notification TO notify_svc;
GRANT SELECT, INSERT, UPDATE ON notify.notification_preference TO notify_svc;
GRANT SELECT, INSERT ON notify.email_delivery TO notify_svc;
GRANT SELECT, INSERT, UPDATE ON notify.proposal_participant TO notify_svc;
GRANT EXECUTE ON FUNCTION notify.claim_email_deliveries(integer, integer) TO notify_svc;
GRANT EXECUTE ON FUNCTION notify.mark_email_sent(uuid, text) TO notify_svc;
GRANT EXECUTE ON FUNCTION notify.mark_email_failed(uuid, text, integer) TO notify_svc;
