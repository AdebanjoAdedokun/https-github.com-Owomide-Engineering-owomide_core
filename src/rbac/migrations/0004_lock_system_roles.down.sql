-- Rollback: 0004_lock_system_roles
-- Service: rbac
GRANT INSERT, UPDATE, DELETE ON rbac.role, rbac.role_permission TO rbac_svc;
