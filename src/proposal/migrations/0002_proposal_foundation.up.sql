-- Migration: 0002_proposal_foundation
-- Service: proposal
-- PostgreSQL 16+

CREATE FUNCTION proposal.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

CREATE FUNCTION proposal.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

-- proposal: the canonical pricing proposal record
CREATE TABLE proposal.proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  state text NOT NULL CHECK (state IN ('draft', 'submitted', 'blocked', 'approved', 'published')),
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  change_set_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id)
);

CREATE INDEX proposal_org_state_idx
  ON proposal.proposal (org_id, state, id);
CREATE INDEX proposal_org_actor_idx
  ON proposal.proposal (org_id, actor_id, id);
CREATE INDEX proposal_org_created_idx
  ON proposal.proposal (org_id, created_at DESC, id);

CREATE TRIGGER proposal_set_updated_at
BEFORE UPDATE ON proposal.proposal
FOR EACH ROW EXECUTE FUNCTION proposal.set_updated_at();

-- proposal_line: individual SKU price change within a proposal
CREATE TABLE proposal.proposal_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  sku_id text NOT NULL CHECK (btrim(sku_id) <> ''),
  channel_id text NOT NULL CHECK (btrim(channel_id) <> ''),
  current_price_minor bigint NOT NULL,
  current_price_currency text NOT NULL CHECK (current_price_currency ~ '^[A-Z]{3}$'),
  proposed_price_minor bigint NOT NULL,
  proposed_price_currency text NOT NULL CHECK (proposed_price_currency ~ '^[A-Z]{3}$'),
  reason text NOT NULL DEFAULT '',
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id)
);

CREATE INDEX proposal_line_org_proposal_idx
  ON proposal.proposal_line (org_id, proposal_id, id);

-- proposal_transition: append-only state machine audit log
CREATE TABLE proposal.proposal_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  from_state text CHECK (from_state IS NULL OR from_state IN ('draft', 'submitted', 'blocked', 'approved', 'published')),
  to_state text NOT NULL CHECK (to_state IN ('draft', 'submitted', 'blocked', 'approved', 'published')),
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id)
);

CREATE INDEX proposal_transition_org_proposal_idx
  ON proposal.proposal_transition (org_id, proposal_id, occurred_at DESC);

-- proposal_comment: append-only comment feed
CREATE TABLE proposal.proposal_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  author_id text NOT NULL CHECK (btrim(author_id) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id)
);

CREATE INDEX proposal_comment_org_proposal_idx
  ON proposal.proposal_comment (org_id, proposal_id, occurred_at DESC);

-- override_request: single-use exception to a margin floor; requires different actor to approve
CREATE TABLE proposal.override_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  requester_id text NOT NULL CHECK (btrim(requester_id) <> ''),
  justification text NOT NULL CHECK (btrim(justification) <> ''),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  decider_id text CHECK (decider_id IS NULL OR btrim(decider_id) <> ''),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id),
  CHECK ((decided_at IS NULL) = (decider_id IS NULL))
);

CREATE INDEX override_request_org_proposal_idx
  ON proposal.override_request (org_id, proposal_id, id);
CREATE INDEX override_request_org_pending_idx
  ON proposal.override_request (org_id, requested_at DESC)
  WHERE status = 'pending';

-- change_set: bulk repricing draft; becomes a proposal on submit
CREATE TABLE proposal.change_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'discarded')),
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  rule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rule) = 'object'),
  proposal_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX change_set_org_drafts_idx
  ON proposal.change_set (org_id, created_at DESC, id)
  WHERE status = 'draft';
CREATE INDEX change_set_org_actor_idx
  ON proposal.change_set (org_id, actor_id, id);
CREATE INDEX change_set_org_proposal_idx
  ON proposal.change_set (org_id, proposal_id)
  WHERE proposal_id IS NOT NULL;

-- FK from change_set → proposal: set on submit when the change_set is wrapped in a proposal
ALTER TABLE proposal.change_set
  ADD CONSTRAINT change_set_proposal_fk
  FOREIGN KEY (org_id, proposal_id)
  REFERENCES proposal.proposal (org_id, id);

CREATE TRIGGER change_set_set_updated_at
BEFORE UPDATE ON proposal.change_set
FOR EACH ROW EXECUTE FUNCTION proposal.set_updated_at();

-- change_set_line: one SKU price move in a change_set preview
CREATE TABLE proposal.change_set_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  change_set_id uuid NOT NULL,
  sku_id text NOT NULL CHECK (btrim(sku_id) <> ''),
  channel_id text NOT NULL CHECK (btrim(channel_id) <> ''),
  current_price_minor bigint NOT NULL,
  current_price_currency text NOT NULL CHECK (current_price_currency ~ '^[A-Z]{3}$'),
  proposed_price_minor bigint NOT NULL,
  proposed_price_currency text NOT NULL CHECK (proposed_price_currency ~ '^[A-Z]{3}$'),
  diff_pct numeric(10,4) NOT NULL,
  diff_absolute_minor bigint NOT NULL,
  diff_absolute_currency text NOT NULL CHECK (diff_absolute_currency ~ '^[A-Z]{3}$'),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, change_set_id) REFERENCES proposal.change_set (org_id, id)
);

CREATE INDEX change_set_line_org_change_set_idx
  ON proposal.change_set_line (org_id, change_set_id, id);

-- scheduled_rollout: delayed-publish worker target keyed on effective_at
CREATE TABLE proposal.scheduled_rollout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  effective_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'dispatched', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id)
);

CREATE INDEX scheduled_rollout_org_pending_idx
  ON proposal.scheduled_rollout (org_id, effective_at ASC)
  WHERE status = 'pending';
CREATE INDEX scheduled_rollout_org_proposal_idx
  ON proposal.scheduled_rollout (org_id, proposal_id);

-- outbox_event: transactional outbox for proposal.* and override.* events
CREATE TABLE proposal.outbox_event (
  id uuid PRIMARY KEY,
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  aggregate_type text NOT NULL CHECK (btrim(aggregate_type) <> ''),
  aggregate_id text NOT NULL CHECK (btrim(aggregate_id) <> ''),
  partition_key text NOT NULL CHECK (btrim(partition_key) <> ''),
  payload bytea NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  published_at timestamptz,
  last_error text,
  UNIQUE (org_id, id)
);

CREATE INDEX outbox_event_pending_idx
  ON proposal.outbox_event (available_at, occurred_at, id)
  WHERE published_at IS NULL;

CREATE FUNCTION proposal.claim_outbox_events(p_limit integer, p_lease_seconds integer DEFAULT 30)
RETURNS SETOF proposal.outbox_event
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
  WITH claimed AS (
    SELECT id
    FROM proposal.outbox_event
    WHERE published_at IS NULL
      AND available_at <= clock_timestamp()
    ORDER BY occurred_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  UPDATE proposal.outbox_event AS event
  SET attempts = event.attempts + 1,
      available_at = clock_timestamp() + make_interval(secs => GREATEST(1, p_lease_seconds))
  FROM claimed
  WHERE event.id = claimed.id
  RETURNING event.*;
$$;

CREATE FUNCTION proposal.mark_outbox_published(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
  UPDATE proposal.outbox_event
  SET published_at = clock_timestamp(),
      last_error = NULL
  WHERE id = p_id AND published_at IS NULL;
$$;

CREATE FUNCTION proposal.mark_outbox_failed(p_id uuid, p_error text, p_retry_seconds integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
  UPDATE proposal.outbox_event
  SET last_error = left(p_error, 2000),
      available_at = clock_timestamp() + make_interval(secs => GREATEST(1, p_retry_seconds))
  WHERE id = p_id AND published_at IS NULL;
$$;

-- Row-level security — every table

ALTER TABLE proposal.proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_line FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_transition FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_comment FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.override_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.override_request FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.change_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.change_set FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.change_set_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.change_set_line FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.scheduled_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.scheduled_rollout FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.outbox_event FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_tenant_policy ON proposal.proposal
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY proposal_line_tenant_policy ON proposal.proposal_line
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY proposal_transition_tenant_policy ON proposal.proposal_transition
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY proposal_comment_tenant_policy ON proposal.proposal_comment
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY override_request_tenant_policy ON proposal.override_request
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY change_set_tenant_policy ON proposal.change_set
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY change_set_line_tenant_policy ON proposal.change_set_line
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY scheduled_rollout_tenant_policy ON proposal.scheduled_rollout
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY outbox_event_tenant_policy ON proposal.outbox_event
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());

-- Grants

REVOKE ALL ON FUNCTION proposal.claim_outbox_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION proposal.mark_outbox_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION proposal.mark_outbox_failed(uuid, text, integer) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA proposal TO proposal_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA proposal TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.current_org_id() TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.claim_outbox_events(integer, integer) TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.mark_outbox_published(uuid) TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.mark_outbox_failed(uuid, text, integer) TO proposal_svc;

-- Append-only tables: INSERT only, no UPDATE or DELETE
REVOKE UPDATE ON proposal.proposal_transition FROM proposal_svc;
REVOKE DELETE ON proposal.proposal_transition FROM proposal_svc;
REVOKE UPDATE ON proposal.proposal_comment FROM proposal_svc;
REVOKE DELETE ON proposal.proposal_comment FROM proposal_svc;
-- Outbox mutations go through SECURITY DEFINER functions only
REVOKE UPDATE ON proposal.outbox_event FROM proposal_svc;
REVOKE DELETE ON proposal.outbox_event FROM proposal_svc;
