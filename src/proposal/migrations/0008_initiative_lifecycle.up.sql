-- Migration: 0008_initiative_lifecycle
-- Service: proposal
-- PostgreSQL 16+
--
-- Pricing Initiative lifecycle (PRD INIT-010 to INIT-014; decision D-08). An Initiative's state
-- changes only by inserting a row into initiative_transition, and only along the allowed moves.
-- Pausing, cancelling and going backwards need a reason. The table mirrors
-- src/domain/initiative-lifecycle.ts; an integration test keeps the two identical.

CREATE TABLE proposal.initiative_lifecycle_rule (
  from_state text NOT NULL,
  to_state text NOT NULL,
  PRIMARY KEY (from_state, to_state)
);

INSERT INTO proposal.initiative_lifecycle_rule (from_state, to_state) VALUES
    ('initiated', 'in_development'),
    ('initiated', 'on_hold'),
    ('initiated', 'cancelled'),
    ('in_development', 'in_review'),
    ('in_development', 'awaiting_approval'),
    ('in_development', 'on_hold'),
    ('in_development', 'cancelled'),
    ('in_review', 'in_development'),
    ('in_review', 'awaiting_approval'),
    ('in_review', 'on_hold'),
    ('in_review', 'cancelled'),
    ('awaiting_approval', 'in_development'),
    ('awaiting_approval', 'ready_for_execution'),
    ('awaiting_approval', 'on_hold'),
    ('awaiting_approval', 'cancelled'),
    ('ready_for_execution', 'implemented'),
    ('ready_for_execution', 'on_hold'),
    ('ready_for_execution', 'cancelled'),
    ('implemented', 'monitoring'),
    ('implemented', 'completed'),
    ('monitoring', 'completed'),
    ('on_hold', 'in_development'),
    ('on_hold', 'cancelled');

CREATE FUNCTION proposal.initiative_state_order(p_state text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_position(ARRAY[
    'initiated', 'in_development', 'in_review', 'awaiting_approval', 'ready_for_execution',
    'implemented', 'monitoring', 'completed', 'on_hold', 'cancelled'
  ], p_state);
$$;

CREATE FUNCTION proposal.initiative_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM proposal.initiative_lifecycle_rule WHERE from_state = p_from AND to_state = p_to
  );
$$;

CREATE FUNCTION proposal.initiative_reason_required(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_to IN ('on_hold', 'cancelled')
      OR (p_from <> 'on_hold'
          AND proposal.initiative_state_order(p_to) < proposal.initiative_state_order(p_from));
$$;

-- Validates each transition against the Initiative's current state (locked, so concurrent moves
-- serialise) and applies it in the same statement. Runs BEFORE INSERT so a multi-row insert of a
-- chain of moves sees each earlier move. SECURITY DEFINER because proposal_svc has no UPDATE
-- privilege on lifecycle_state (see the grants below); row-level security still applies.
CREATE FUNCTION proposal.apply_initiative_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT lifecycle_state INTO v_state
  FROM proposal.initiative
  WHERE org_id = NEW.org_id AND id = NEW.initiative_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'initiative % not found', NEW.initiative_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.from_state IS NULL THEN
    -- The creation record: only 'initiated', only while the Initiative is still initiated.
    IF NEW.to_state <> 'initiated' OR v_state <> 'initiated' THEN
      RAISE EXCEPTION 'a creation transition must record the initiated state'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.from_state IS DISTINCT FROM v_state THEN
    RAISE EXCEPTION 'initiative is %, not %', v_state, NEW.from_state
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF NOT proposal.initiative_transition_allowed(NEW.from_state, NEW.to_state) THEN
    RAISE EXCEPTION 'an initiative cannot move from % to %', NEW.from_state, NEW.to_state
      USING ERRCODE = 'check_violation';
  END IF;
  IF proposal.initiative_reason_required(NEW.from_state, NEW.to_state)
     AND btrim(NEW.reason) = '' THEN
    RAISE EXCEPTION 'moving an initiative from % to % needs a reason', NEW.from_state, NEW.to_state
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('proposal.applying_transition', 'on', true);
  UPDATE proposal.initiative SET lifecycle_state = NEW.to_state
  WHERE org_id = NEW.org_id AND id = NEW.initiative_id;
  PERFORM set_config('proposal.applying_transition', 'off', true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER initiative_transition_apply
BEFORE INSERT ON proposal.initiative_transition
FOR EACH ROW EXECUTE FUNCTION proposal.apply_initiative_transition();

-- lifecycle_state can change only through a transition row, even for the table owner. New
-- Initiatives start 'initiated'.
CREATE FUNCTION proposal.guard_initiative_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_state <> 'initiated' THEN
      RAISE EXCEPTION 'a new initiative starts in the initiated state'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
        AND coalesce(current_setting('proposal.applying_transition', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'an initiative changes state only by recording a transition'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER initiative_state_guard
BEFORE INSERT OR UPDATE ON proposal.initiative
FOR EACH ROW EXECUTE FUNCTION proposal.guard_initiative_state();

-- The service may edit an Initiative's descriptive fields, never its state.
REVOKE UPDATE ON proposal.initiative FROM proposal_svc;
GRANT UPDATE (title, objective, priority, owner_user_id, overlap_acknowledged_by)
  ON proposal.initiative TO proposal_svc;
REVOKE ALL ON FUNCTION proposal.apply_initiative_transition() FROM PUBLIC;

GRANT SELECT ON proposal.initiative_lifecycle_rule TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.initiative_state_order(text) TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.initiative_transition_allowed(text, text) TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.initiative_reason_required(text, text) TO proposal_svc;
