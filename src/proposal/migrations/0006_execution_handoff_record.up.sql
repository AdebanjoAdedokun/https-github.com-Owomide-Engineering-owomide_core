-- Migration: 0006_execution_handoff_record
-- Service: proposal
-- PostgreSQL 16+
--
-- Execution hand-off and the per-line implementation record (decision D-06; PRD EXPORT-002,
-- EXPORT-009, EXEC-006, EXEC-007, EXEC-010). Enforced here:
--   * exports and implementation records exist only for an approved, current version;
--   * both are append-only: a correction is a new row, and the latest row per line is current;
--   * an implementation row carries the outcome's required evidence;
--   * a repeated request (same request_id) can never create a second row.
-- Downloading an export records who, what and when. It changes no status and no price.

CREATE FUNCTION proposal.assert_version_executable(p_org_id text, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_superseded uuid;
BEGIN
  SELECT status, superseded_by_version_id INTO v_status, v_superseded
    FROM proposal.proposal_version
   WHERE org_id = p_org_id AND id = p_version_id;
  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'version % is not approved', p_version_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_superseded IS NOT NULL THEN
    RAISE EXCEPTION 'version % is superseded', p_version_id USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE TABLE proposal.export_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_version_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('execution_csv', 'handoff_summary')),
  exported_by text NOT NULL CHECK (btrim(exported_by) <> ''),
  exported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  line_count integer NOT NULL CHECK (line_count >= 0),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_version_id) REFERENCES proposal.proposal_version (org_id, id)
);

CREATE INDEX export_event_org_version_idx
  ON proposal.export_event (org_id, proposal_version_id, exported_at DESC);

CREATE TABLE proposal.implementation_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  proposal_version_id uuid NOT NULL,
  -- Identifies the snapshot line: sku, channel and optional location.
  sku_id text NOT NULL CHECK (btrim(sku_id) <> ''),
  channel_id text NOT NULL CHECK (btrim(channel_id) <> ''),
  location_id text,
  outcome text NOT NULL CHECK (outcome IN ('implemented', 'failed', 'implemented_different')),
  authorised_price_minor bigint NOT NULL CHECK (authorised_price_minor >= 0),
  implemented_price_minor bigint CHECK (implemented_price_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  actual_effective_at timestamptz,
  reference text NOT NULL DEFAULT '',
  failure_reason text NOT NULL DEFAULT '',
  recorded_by text NOT NULL CHECK (btrim(recorded_by) <> ''),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id text NOT NULL CHECK (btrim(request_id) <> ''),
  catalog_write_operation_id uuid,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, proposal_version_id) REFERENCES proposal.proposal_version (org_id, id),
  CHECK (outcome <> 'failed' OR (btrim(failure_reason) <> '' AND implemented_price_minor IS NULL)),
  CHECK (outcome = 'failed' OR (
    implemented_price_minor IS NOT NULL
    AND actual_effective_at IS NOT NULL
    AND btrim(reference) <> ''
  )),
  CHECK (outcome <> 'implemented' OR implemented_price_minor = authorised_price_minor),
  CHECK (outcome <> 'implemented_different' OR implemented_price_minor <> authorised_price_minor)
);

-- Idempotency: one row per request and line, however many times the request is retried.
CREATE UNIQUE INDEX implementation_line_request_uniq
  ON proposal.implementation_line
     (org_id, request_id, sku_id, channel_id, COALESCE(location_id, ''));

CREATE INDEX implementation_line_current_idx
  ON proposal.implementation_line
     (org_id, proposal_version_id, sku_id, channel_id, COALESCE(location_id, ''), recorded_at DESC);

CREATE FUNCTION proposal.guard_executable_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM proposal.assert_version_executable(NEW.org_id, NEW.proposal_version_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER export_event_executable
BEFORE INSERT ON proposal.export_event
FOR EACH ROW EXECUTE FUNCTION proposal.guard_executable_version();

CREATE TRIGGER implementation_line_executable
BEFORE INSERT ON proposal.implementation_line
FOR EACH ROW EXECUTE FUNCTION proposal.guard_executable_version();

-- The current record for each line: the latest row. Execution status is derived from this
-- (src/domain/execution.ts), never stored separately.
CREATE VIEW proposal.implementation_line_current
WITH (security_invoker = true) AS
SELECT DISTINCT ON (org_id, proposal_version_id, sku_id, channel_id, COALESCE(location_id, ''))
       *
  FROM proposal.implementation_line
 ORDER BY org_id, proposal_version_id, sku_id, channel_id, COALESCE(location_id, ''),
          recorded_at DESC, id DESC;

ALTER TABLE proposal.export_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.export_event FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal.implementation_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal.implementation_line FORCE ROW LEVEL SECURITY;

CREATE POLICY export_event_tenant_policy ON proposal.export_event
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());
CREATE POLICY implementation_line_tenant_policy ON proposal.implementation_line
  USING (org_id = proposal.current_org_id()) WITH CHECK (org_id = proposal.current_org_id());

-- Append-only: INSERT and SELECT only.
GRANT SELECT, INSERT ON proposal.export_event, proposal.implementation_line TO proposal_svc;
GRANT SELECT ON proposal.implementation_line_current TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.assert_version_executable(text, uuid) TO proposal_svc;
