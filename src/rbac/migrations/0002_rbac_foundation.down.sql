-- Rollback: 0002_rbac_foundation
-- Service: rbac
DROP TABLE IF EXISTS rbac.role_permission;
DROP TABLE IF EXISTS rbac.role;
DROP FUNCTION IF EXISTS rbac.current_org_id();
