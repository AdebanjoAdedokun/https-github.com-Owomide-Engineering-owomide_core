-- Migration: 0002_audit_log_foundation
-- Service: governance
-- PostgreSQL 16+

CREATE FUNCTION governance.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

-- audit_log: append-only record of every state change in the system.
-- Written exclusively by the event subscriber (F6.2); no gRPC/REST write path.
CREATE TABLE governance.audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text        NOT NULL CHECK (btrim(org_id) <> ''),
  event_id     text        NOT NULL,
  event_type   text        NOT NULL CHECK (btrim(event_type) <> ''),
  entity_type  text        NOT NULL CHECK (btrim(entity_type) <> ''),
  entity_id    text        NOT NULL CHECK (btrim(entity_id) <> ''),
  actor_id     text        NOT NULL CHECK (btrim(actor_id) <> ''),
  occurred_at  timestamptz NOT NULL,
  ingested_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  payload      jsonb       NOT NULL,
  UNIQUE (org_id, id),                        -- supports future range-partitioning by org_id
  UNIQUE (event_id)                            -- global idempotency; bus message IDs are UUIDs
);

CREATE INDEX audit_log_org_occurred_idx
  ON governance.audit_log (org_id, occurred_at DESC, id);

CREATE INDEX audit_log_org_entity_idx
  ON governance.audit_log (org_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX audit_log_org_event_type_idx
  ON governance.audit_log (org_id, event_type, occurred_at DESC);

-- Row-level security
ALTER TABLE governance.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_tenant_policy ON governance.audit_log
  USING (org_id = governance.current_org_id())
  WITH CHECK (org_id = governance.current_org_id());

-- Grants: explicit per-table (no broad GRANT ALL that future tables inherit)
GRANT SELECT, INSERT ON governance.audit_log TO governance_svc;
GRANT EXECUTE ON FUNCTION governance.current_org_id() TO governance_svc;
