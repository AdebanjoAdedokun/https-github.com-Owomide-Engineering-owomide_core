-- Rollback: 0003_seed_system_roles
-- Service: rbac
-- Removes the 11 global system roles and their grants (ON DELETE CASCADE
-- on rbac.role_permission.role_id takes the grants with them).
DELETE FROM rbac.role WHERE org_id IS NULL AND is_system;
