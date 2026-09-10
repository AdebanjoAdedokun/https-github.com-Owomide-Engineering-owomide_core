-- Migration: 0002_rbac_foundation
-- Service: rbac
-- PostgreSQL 16+

CREATE FUNCTION rbac.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

-- role.org_id is nullable: NULL means a global system role, shared by every
-- org (the 11 roles from docs/rbac/roles.csv). A non-null org_id means a
-- v2 custom role owned by exactly that org. Same table serves both — a
-- custom role is created by duplicating an existing role's grants into a
-- new row with org_id set (DuplicateRole, tracked in FUTURE.md, not built
-- here).
CREATE TABLE rbac.role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A plain UNIQUE(org_id, code) does not work here: Postgres never considers
-- two NULLs equal, so it would happily accept duplicate global roles with
-- the same code. Two partial indexes instead: one enforces uniqueness among
-- global roles (org_id IS NULL), the other among an org's own custom roles.
CREATE UNIQUE INDEX role_global_code_uniq ON rbac.role (code) WHERE org_id IS NULL;
CREATE UNIQUE INDEX role_org_code_uniq ON rbac.role (org_id, code) WHERE org_id IS NOT NULL;

-- One row per *granted* permission only. No row for a (role, permission)
-- pair means Deny — there is no allow/deny boolean column to keep in sync.
CREATE TABLE rbac.role_permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES rbac.role (id) ON DELETE CASCADE,
  permission_name text NOT NULL CHECK (btrim(permission_name) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (role_id, permission_name)
);

CREATE INDEX role_permission_role_id_idx ON rbac.role_permission (role_id);

-- RLS differs from this repo's usual strict-equality tenant policy because
-- this table legitimately holds both global rows (org_id IS NULL, visible
-- to every org) and org-owned rows (v2 custom roles). Read access always
-- includes the global rows; write access is restricted to the caller's own
-- org so nothing can write a global row through the tenant path.
ALTER TABLE rbac.role ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.role FORCE ROW LEVEL SECURITY;
CREATE POLICY role_tenant_policy ON rbac.role
  USING (org_id IS NULL OR org_id = rbac.current_org_id())
  WITH CHECK (org_id = rbac.current_org_id());

ALTER TABLE rbac.role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.role_permission FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permission_tenant_policy ON rbac.role_permission
  USING (
    EXISTS (
      SELECT 1 FROM rbac.role r
      WHERE r.id = role_permission.role_id
        AND (r.org_id IS NULL OR r.org_id = rbac.current_org_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rbac.role r
      WHERE r.id = role_permission.role_id
        AND r.org_id = rbac.current_org_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rbac TO rbac_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA rbac TO rbac_svc;
GRANT EXECUTE ON FUNCTION rbac.current_org_id() TO rbac_svc;
