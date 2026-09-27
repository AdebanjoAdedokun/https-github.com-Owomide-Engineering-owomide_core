-- Migration: 0005_initiative_versions_decisions
-- Service: proposal
-- PostgreSQL 16+
--
-- Pricing Initiative, frozen Proposal versions and decisions bound to one version.
-- Implements the proposed options for decisions D-05 and D-08 (not yet ratified) and
-- PRD INIT-001 to INIT-004, INIT-013, PROP-011, PROP-012, PROP-015 to PROP-017 and FLOW-013.
-- The invariants that must never be bypassed are enforced here, not only in the service:
--   * a submitted version's decision snapshot can never change;
--   * the person who submitted a version can never decide it, whatever roles they hold;
--   * a decision applies to exactly one version, once, and only while it awaits approval;
--   * draft lines can only change while their version is a draft;
--   * assumptions, transitions and decisions are append-only.

-- ---------------------------------------------------------------- Pricing Initiative

CREATE TABLE proposal.initiative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  type text NOT NULL CHECK (type IN (
    'price_increase', 'price_decrease', 'scheduled_price_review', 'cost_driven_repricing',
    'margin_protection', 'competitor_response', 'promotion_campaign', 'new_product_pricing',
    'markdown_clearance', 'category_review', 'strategy_rule_change', 'other'
  )),
  title text NOT NULL CHECK (btrim(title) <> ''),
  objective text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  owner_user_id text NOT NULL CHECK (btrim(owner_user_id) <> ''),
  lifecycle_state text NOT NULL DEFAULT 'initiated' CHECK (lifecycle_state IN (
    'initiated', 'in_development', 'in_review', 'awaiting_approval', 'ready_for_execution',
    'implemented', 'monitoring', 'completed', 'on_hold', 'cancelled'
  )),
  created_from text NOT NULL DEFAULT 'manual' CHECK (btrim(created_from) <> ''),
  overlap_acknowledged_by text,
  created_by text NOT NULL CHECK (btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id)
);

CREATE INDEX initiative_org_state_idx ON proposal.initiative (org_id, lifecycle_state, id);
CREATE INDEX initiative_org_created_idx ON proposal.initiative (org_id, created_at DESC, id);

CREATE TRIGGER initiative_set_updated_at
BEFORE UPDATE ON proposal.initiative
FOR EACH ROW EXECUTE FUNCTION proposal.set_updated_at();

-- Scope members are never deleted: removal is recorded with who, when and why.
CREATE TABLE proposal.initiative_scope_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  initiative_id uuid NOT NULL,
  sku_id text NOT NULL CHECK (btrim(sku_id) <> ''),
  channel_id text NOT NULL CHECK (btrim(channel_id) <> ''),
  location_id text,
  added_by text NOT NULL CHECK (btrim(added_by) <> ''),
  added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_by text,
  removed_at timestamptz,
  removal_reason text,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, initiative_id) REFERENCES proposal.initiative (org_id, id),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CHECK (removed_at IS NULL OR btrim(coalesce(removal_reason, '')) <> '')
);

CREATE UNIQUE INDEX initiative_scope_member_active_uniq
  ON proposal.initiative_scope_member
     (org_id, initiative_id, sku_id, channel_id, COALESCE(location_id, ''))
  WHERE removed_at IS NULL;
CREATE INDEX initiative_scope_member_sku_idx
  ON proposal.initiative_scope_member (org_id, sku_id) WHERE removed_at IS NULL;

CREATE FUNCTION proposal.guard_scope_member_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'scope member % was already removed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'removed_by' - 'removed_at' - 'removal_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'removed_by' - 'removed_at' - 'removal_reason') THEN
    RAISE EXCEPTION 'scope members can only be removed, not changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER initiative_scope_member_guard
BEFORE UPDATE ON proposal.initiative_scope_member
FOR EACH ROW EXECUTE FUNCTION proposal.guard_scope_member_update();

CREATE TABLE proposal.initiative_assumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  initiative_id uuid NOT NULL,
  statement text NOT NULL CHECK (btrim(statement) <> ''),
  author_id text NOT NULL CHECK (btrim(author_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, initiative_id) REFERENCES proposal.initiative (org_id, id)
);

CREATE TABLE proposal.initiative_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  initiative_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  reason text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, initiative_id) REFERENCES proposal.initiative (org_id, id)
);

CREATE INDEX initiative_transition_org_initiative_idx
  ON proposal.initiative_transition (org_id, initiative_id, occurred_at DESC);

-- ---------------------------------------------------------------- Proposals belong to an Initiative

ALTER TABLE proposal.proposal ADD COLUMN initiative_id uuid;
ALTER TABLE proposal.proposal
  ADD CONSTRAINT proposal_initiative_fk
  FOREIGN KEY (org_id, initiative_id) REFERENCES proposal.initiative (org_id, id);
-- Not yet required: the current CreateProposal path (proposal-repository.ts) does not know about
-- Initiatives. The follow-up that adds CreateInitiative to the API also adds
--   CHECK (initiative_id IS NOT NULL) NOT VALID
-- so that no new Proposal can exist without an Initiative (INIT-001, BDD 17).
CREATE INDEX proposal_org_initiative_idx ON proposal.proposal (org_id, initiative_id, id);

-- ---------------------------------------------------------------- Controlled Proposal versions

CREATE TABLE proposal.proposal_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'awaiting_approval', 'changes_requested', 'rejected', 'approved'
  )),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by text NOT NULL CHECK (btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_by text,
  submitted_at timestamptz,
  snapshot jsonb,
  snapshot_hash text,
  previous_version_id uuid,
  superseded_by_version_id uuid,
  UNIQUE (org_id, id),
  UNIQUE (org_id, proposal_id, version_number),
  FOREIGN KEY (org_id, proposal_id) REFERENCES proposal.proposal (org_id, id),
  FOREIGN KEY (org_id, previous_version_id) REFERENCES proposal.proposal_version (org_id, id),
  FOREIGN KEY (org_id, superseded_by_version_id) REFERENCES proposal.proposal_version (org_id, id),
  CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
  CHECK ((submitted_at IS NULL) = (snapshot IS NULL)),
  CHECK ((snapshot IS NULL) = (snapshot_hash IS NULL)),
  CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);

-- One open draft per Proposal at a time.
CREATE UNIQUE INDEX proposal_version_one_draft_uniq
  ON proposal.proposal_version (org_id, proposal_id) WHERE status = 'draft';
CREATE INDEX proposal_version_org_status_idx
  ON proposal.proposal_version (org_id, status, id);

CREATE FUNCTION proposal.guard_proposal_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_outcome text;
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id THEN
    RAISE EXCEPTION 'proposal version identity cannot change' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.submitted_at IS NOT NULL THEN
    -- Frozen (PROP-011): the decision snapshot and who submitted it never change.
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.revision IS DISTINCT FROM OLD.revision THEN
      RAISE EXCEPTION 'submitted proposal version % is frozen', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.superseded_by_version_id IS NOT NULL
       AND NEW.superseded_by_version_id IS DISTINCT FROM OLD.superseded_by_version_id THEN
      RAISE EXCEPTION 'proposal version % is already superseded', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      -- After submission, status only follows a recorded decision on this exact version.
      SELECT outcome INTO latest_outcome
        FROM proposal.decision
       WHERE org_id = OLD.org_id AND proposal_version_id = OLD.id;
      IF OLD.status <> 'awaiting_approval' OR latest_outcome IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'status of submitted version % can only follow its decision', OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Still a draft: it may only stay a draft or be submitted, all at once.
  IF NEW.status NOT IN ('draft', 'awaiting_approval') THEN
    RAISE EXCEPTION 'a draft can only be submitted, not %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'awaiting_approval' AND NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'submitting needs submitter, time and snapshot' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.superseded_by_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'a draft cannot be superseded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_version_guard
BEFORE UPDATE ON proposal.proposal_version
FOR EACH ROW EXECUTE FUNCTION proposal.guard_proposal_version_update();

CREATE FUNCTION proposal.guard_proposal_version_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.submitted_at IS NOT NULL OR NEW.superseded_by_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'a new proposal version starts as an unsubmitted draft'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_version_insert_guard
BEFORE INSERT ON proposal.proposal_version
FOR EACH ROW EXECUTE FUNCTION proposal.guard_proposal_version_insert();

-- Draft lines: editable only while their version is a draft. Submitted lines live in the snapshot.
CREATE TABLE proposal.proposal_version_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_version_id uuid NOT NULL,
  sku_id text NOT NULL CHECK (btrim(sku_id) <> ''),
  channel_id text NOT NULL CHECK (btrim(channel_id) <> ''),
  location_id text,
  line jsonb NOT NULL CHECK (jsonb_typeof(line) = 'object'),
  analysis_stale boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_version_id) REFERENCES proposal.proposal_version (org_id, id)
);

CREATE UNIQUE INDEX proposal_version_line_context_uniq
  ON proposal.proposal_version_line
     (org_id, proposal_version_id, sku_id, channel_id, COALESCE(location_id, ''));

CREATE FUNCTION proposal.guard_draft_line_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status text;
  target proposal.proposal_version_line;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT status INTO version_status
    FROM proposal.proposal_version
   WHERE org_id = target.org_id AND id = target.proposal_version_id;
  IF version_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'lines can only change while the version is a draft'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.proposal_version_id IS DISTINCT FROM OLD.proposal_version_id THEN
    RAISE EXCEPTION 'a line cannot move between versions' USING ERRCODE = 'check_violation';
  END IF;
  RETURN target;
END;
$$;

CREATE TRIGGER proposal_version_line_guard
BEFORE INSERT OR UPDATE OR DELETE ON proposal.proposal_version_line
FOR EACH ROW EXECUTE FUNCTION proposal.guard_draft_line_change();

-- ---------------------------------------------------------------- Decisions (append-only)

CREATE TABLE proposal.decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_version_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('approved', 'rejected', 'changes_requested')),
  decided_by text NOT NULL CHECK (btrim(decided_by) <> ''),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL DEFAULT '',
  UNIQUE (org_id, id),
  -- Release 1 has one approval step: one decision per version.
  UNIQUE (org_id, proposal_version_id),
  FOREIGN KEY (org_id, proposal_version_id) REFERENCES proposal.proposal_version (org_id, id),
  CHECK (outcome = 'approved' OR btrim(reason) <> '')
);

CREATE FUNCTION proposal.enforce_decision_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v proposal.proposal_version;
BEGIN
  SELECT * INTO v
    FROM proposal.proposal_version
   WHERE org_id = NEW.org_id AND id = NEW.proposal_version_id
   FOR UPDATE;
  IF v.status IS DISTINCT FROM 'awaiting_approval' THEN
    RAISE EXCEPTION 'version % is not awaiting approval', NEW.proposal_version_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Maker-checker (FLOW-013): the actual submitter never decides, whatever roles they hold.
  IF NEW.decided_by = v.submitted_by THEN
    RAISE EXCEPTION 'the person who submitted version % cannot decide it', NEW.proposal_version_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER decision_rules
BEFORE INSERT ON proposal.decision
FOR EACH ROW EXECUTE FUNCTION proposal.enforce_decision_rules();

CREATE FUNCTION proposal.apply_decision_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE proposal.proposal_version
     SET status = NEW.outcome
   WHERE org_id = NEW.org_id AND id = NEW.proposal_version_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER decision_apply_status
AFTER INSERT ON proposal.decision
FOR EACH ROW EXECUTE FUNCTION proposal.apply_decision_status();

-- ---------------------------------------------------------------- Row-level security

ALTER TABLE proposal.initiative ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_scope_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_scope_member FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_assumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_assumption FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.initiative_transition FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_version FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_version_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.proposal_version_line FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.decision FORCE ROW LEVEL SECURITY;

CREATE POLICY initiative_tenant_policy ON proposal.initiative
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY initiative_scope_member_tenant_policy ON proposal.initiative_scope_member
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY initiative_assumption_tenant_policy ON proposal.initiative_assumption
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY initiative_transition_tenant_policy ON proposal.initiative_transition
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY proposal_version_tenant_policy ON proposal.proposal_version
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY proposal_version_line_tenant_policy ON proposal.proposal_version_line
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY decision_tenant_policy ON proposal.decision
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());

-- ---------------------------------------------------------------- Grants

GRANT SELECT, INSERT, UPDATE, DELETE ON
  proposal.initiative, proposal.initiative_scope_member, proposal.initiative_assumption,
  proposal.initiative_transition, proposal.proposal_version, proposal.proposal_version_line,
  proposal.decision
TO proposal_svc;

-- Append-only tables: INSERT only, no UPDATE or DELETE
REVOKE UPDATE, DELETE ON proposal.initiative_assumption FROM proposal_svc;
REVOKE UPDATE, DELETE ON proposal.initiative_transition FROM proposal_svc;
REVOKE UPDATE, DELETE ON proposal.decision FROM proposal_svc;
-- Records that are only ever retired, never removed
REVOKE DELETE ON proposal.initiative FROM proposal_svc;
REVOKE DELETE ON proposal.initiative_scope_member FROM proposal_svc;
REVOKE DELETE ON proposal.proposal_version FROM proposal_svc;

-- Declared intent, checked by `make db-check`.
COMMENT ON TABLE proposal.initiative_assumption IS 'Assumptions recorded on an Initiative. @append-only';
COMMENT ON TABLE proposal.initiative_transition IS 'Initiative lifecycle moves. @append-only';
COMMENT ON TABLE proposal.decision IS 'One decision per submitted version. @append-only';
COMMENT ON TABLE proposal.proposal_version_line IS 'Lines of a draft version; freely edited while the version is a draft. @deletable';
