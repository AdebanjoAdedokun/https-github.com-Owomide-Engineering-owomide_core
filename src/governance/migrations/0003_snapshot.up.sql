-- Migration: 0003_snapshot
-- Service: governance
-- PostgreSQL 16+

CREATE TABLE governance.snapshot (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text        NOT NULL CHECK (btrim(org_id) <> ''),
  snapshot_at  timestamptz NOT NULL,
  scope        text        NOT NULL DEFAULT 'catalog' CHECK (btrim(scope) <> ''),
  storage_url  text        NOT NULL CHECK (btrim(storage_url) <> ''),
  row_counts   jsonb       NOT NULL,
  checksum     text        NOT NULL CHECK (btrim(checksum) <> ''),
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id)
);

CREATE INDEX snapshot_org_at_idx
  ON governance.snapshot (org_id, snapshot_at DESC);

ALTER TABLE governance.snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.snapshot FORCE ROW LEVEL SECURITY;

CREATE POLICY snapshot_tenant_policy ON governance.snapshot
  USING (org_id = governance.current_org_id())
  WITH CHECK (org_id = governance.current_org_id());

GRANT SELECT, INSERT ON governance.snapshot TO governance_svc;
