-- Rollback: 0006_seed_workspace_admin_role
-- Service: rbac
-- ON DELETE CASCADE on rbac.role_permission.role_id removes the grants.
DELETE FROM rbac.role WHERE org_id IS NULL AND is_system AND code = 'workspace_admin';
