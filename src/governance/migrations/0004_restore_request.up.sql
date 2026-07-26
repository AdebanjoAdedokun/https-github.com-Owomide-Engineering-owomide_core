-- Migration: 0004_restore_request
-- Service: governance
-- PostgreSQL 16+

CREATE TABLE governance.restore_request (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              text        NOT NULL CHECK (btrim(org_id) <> ''),
  requested_by        text        NOT NULL CHECK (btrim(requested_by) <> ''),
  snapshot_id         uuid        NOT NULL REFERENCES governance.snapshot(id),
  target_timestamp    timestamptz NOT NULL,
  target_environment  text        NOT NULL CHECK (btrim(target_environment) <> ''),
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message       text CHECK (error_message IS NULL OR btrim(error_message) <> ''),
  requested_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at        timestamptz,
  approval_id         text CHECK (approval_id IS NULL OR btrim(approval_id) <> ''),
  UNIQUE (org_id, id)
);

CREATE INDEX restore_request_org_at_idx
  ON governance.restore_request (org_id, requested_at DESC);

ALTER TABLE governance.restore_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.restore_request FORCE ROW LEVEL SECURITY;

CREATE POLICY restore_request_tenant_policy ON governance.restore_request
  USING (org_id = governance.current_org_id())
  WITH CHECK (org_id = governance.current_org_id());

GRANT SELECT, INSERT, UPDATE ON governance.restore_request TO governance_svc;
