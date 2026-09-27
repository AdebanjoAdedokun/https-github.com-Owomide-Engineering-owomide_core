-- Migration: 0006_seed_workspace_admin_role
-- Service: rbac
--
-- Decision D-02: Workspace Admin is a named system role. It administers a workspace (settings
-- within organisation limits, members, templates, assignments) and reads what it administers.
-- It holds no authority over prices or money: no cost data, no drafting, submitting, approving,
-- overriding or implementing, and no organisation-level user or role administration.
-- Release 1 organisations do not enable it (rbac.organisation.enabled_role_codes), so it cannot be
-- assigned until an organisation enables it. Idempotent, like 0003.

INSERT INTO rbac.role (org_id, code, name, is_system) VALUES
  (NULL, 'workspace_admin', 'Workspace Admin', true)
ON CONFLICT (code) WHERE org_id IS NULL DO NOTHING;

-- Workspace Admin (14 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('workspace.configure'),
  ('workspace.manage_members'),
  ('org_settings.read'),
  ('catalogue_item.read'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('template.manage'),
  ('template.use'),
  ('comment.create'),
  ('assignment.assign'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'workspace_admin'
ON CONFLICT (role_id, permission_name) DO NOTHING;
