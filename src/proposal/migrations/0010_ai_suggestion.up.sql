-- Migration: 0010_ai_suggestion
-- Service: proposal
-- PostgreSQL 16+
--
-- The record of every AI suggestion (decision D-01: AI in the first pilot, suggest-only; PRD
-- AI-001 to AI-036). A suggestion is stored exactly as the model returned it, with the model, the
-- prompt version, a hash of the input and the data policy it ran under. It changes nothing until a
-- person applies it, once, and the applied text and who applied it are recorded beside the
-- original ("AI-suggested, applied by ..."). Rows are never edited otherwise or deleted.

CREATE TABLE proposal.ai_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_version_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('proposal_summary')),
  model text NOT NULL CHECK (btrim(model) <> ''),
  prompt_version text NOT NULL CHECK (btrim(prompt_version) <> ''),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  data_policy text NOT NULL CHECK (data_policy IN ('enabled', 'enabled_without_cost_margin')),
  output_text text NOT NULL CHECK (btrim(output_text) <> '' AND length(output_text) <= 4000),
  requested_by text NOT NULL CHECK (btrim(requested_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_by text,
  applied_at timestamptz,
  applied_text text,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_version_id) REFERENCES proposal.proposal_version (org_id, id),
  CHECK ((applied_at IS NULL) = (applied_by IS NULL)),
  CHECK ((applied_at IS NULL) = (applied_text IS NULL)),
  CHECK (applied_text IS NULL OR (btrim(applied_text) <> '' AND length(applied_text) <= 4000)),
  CHECK (applied_at IS NULL OR applied_at >= created_at)
);

CREATE INDEX ai_suggestion_version_idx
  ON proposal.ai_suggestion (org_id, proposal_version_id, created_at DESC);

-- Suggestions summarise a frozen, submitted version only, and apply exactly once.
CREATE FUNCTION proposal.guard_ai_suggestion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.applied_at IS NOT NULL THEN
      RAISE EXCEPTION 'a suggestion is recorded before anyone applies it'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM proposal.proposal_version v
      WHERE v.org_id = NEW.org_id AND v.id = NEW.proposal_version_id AND v.submitted_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'AI summaries are made only for a submitted, frozen version'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'applied_by' - 'applied_at' - 'applied_text')
     IS DISTINCT FROM (to_jsonb(OLD) - 'applied_by' - 'applied_at' - 'applied_text') THEN
    RAISE EXCEPTION 'an AI suggestion is stored exactly as returned'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'an AI suggestion is applied only once' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_suggestion_guard
BEFORE INSERT OR UPDATE ON proposal.ai_suggestion
FOR EACH ROW EXECUTE FUNCTION proposal.guard_ai_suggestion();

ALTER TABLE proposal.ai_suggestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.ai_suggestion FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_suggestion_tenant_policy ON proposal.ai_suggestion
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());

GRANT SELECT, INSERT ON proposal.ai_suggestion TO proposal_svc;
GRANT UPDATE (applied_by, applied_at, applied_text) ON proposal.ai_suggestion TO proposal_svc;
