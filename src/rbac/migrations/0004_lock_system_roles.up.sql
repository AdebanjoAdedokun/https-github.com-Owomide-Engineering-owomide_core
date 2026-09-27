-- Migration: 0004_lock_system_roles
-- Service: rbac
--
-- 0002 granted rbac_svc INSERT, UPDATE and DELETE on role and role_permission. The global system
-- roles are visible to every tenant (org_id IS NULL), so the service could delete or rewrite
-- them for everyone. Nothing in the service writes these tables: system roles are seeded by
-- migrations, and per-organisation custom roles (DuplicateRole) are future work that will grant
-- exactly what it needs.

REVOKE INSERT, UPDATE, DELETE ON rbac.role, rbac.role_permission FROM rbac_svc;
