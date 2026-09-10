-- Migration: 0003_seed_system_roles
-- Service: rbac
--
-- Seeds the 11 global system roles (org_id NULL) and their grants, sourced from
-- src/rbac/src/system-role-templates.ts (itself transcribed once from
-- docs/rbac/role_permissions.csv). Idempotent — safe to re-run.

INSERT INTO rbac.role (org_id, code, name, is_system) VALUES
  (NULL, 'account_owner', 'Account Owner', true),
  (NULL, 'pricing_manager', 'Pricing Manager', true),
  (NULL, 'pricing_analyst', 'Pricing Analyst', true),
  (NULL, 'pricing_contributor', 'Pricing Contributor', true),
  (NULL, 'finance_approver', 'Finance Approver', true),
  (NULL, 'commercial_approver', 'Commercial Approver', true),
  (NULL, 'executive_approver', 'Executive Approver', true),
  (NULL, 'executor', 'Executor', true),
  (NULL, 'viewer', 'Viewer', true),
  (NULL, 'auditor', 'Auditor', true),
  (NULL, 'ai_assistant', 'AI Assistant', true)
ON CONFLICT (code) WHERE org_id IS NULL DO NOTHING;

-- Account Owner (30 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('org_settings.update'),
  ('approval_routing.configure'),
  ('guardrail_defaults.configure'),
  ('org_user.invite'),
  ('org_user.deactivate'),
  ('org_user.assign_role'),
  ('workspace.create'),
  ('workspace.archive'),
  ('workspace.configure'),
  ('workspace.manage_members'),
  ('catalogue_item.read'),
  ('catalogue_item.export'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('override.revoke'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('audit_pack.export'),
  ('template.manage'),
  ('template.use'),
  ('comment.create'),
  ('assignment.assign'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own'),
  ('platform.restore')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'account_owner'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Pricing Manager (29 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('catalogue_item.read'),
  ('catalogue_item.manage'),
  ('catalogue_item.export'),
  ('cost_data.read'),
  ('proposal.create_draft'),
  ('proposal.read'),
  ('proposal.edit_draft'),
  ('proposal.delete_draft'),
  ('proposal.submit'),
  ('proposal.version_history_read'),
  ('pricing_rule.create_draft'),
  ('pricing_rule.read'),
  ('pricing_rule.edit_draft'),
  ('pricing_rule.submit'),
  ('override.request'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('execution.schedule'),
  ('audit_trail.read'),
  ('template.use'),
  ('comment.create'),
  ('change_request.create'),
  ('change_request.triage'),
  ('assignment.assign'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'pricing_manager'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Pricing Analyst (19 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('catalogue_item.read'),
  ('proposal.create_draft'),
  ('proposal.read'),
  ('proposal.edit_draft'),
  ('proposal.delete_draft'),
  ('proposal.version_history_read'),
  ('pricing_rule.create_draft'),
  ('pricing_rule.read'),
  ('pricing_rule.edit_draft'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('template.use'),
  ('comment.create'),
  ('change_request.create'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'pricing_analyst'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Pricing Contributor (5 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('catalogue_item.read'),
  ('comment.create'),
  ('change_request.create'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'pricing_contributor'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Finance Approver (24 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('guardrail_defaults.configure'),
  ('governance_change.confirm'),
  ('catalogue_item.read'),
  ('cost_data.read'),
  ('cost_data.manage'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('approval.approve'),
  ('approval.reject'),
  ('approval.request_changes'),
  ('override.approve'),
  ('override.revoke'),
  ('margin_guardrail.manage'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('comment.create'),
  ('assignment.assign'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'finance_approver'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Commercial Approver (23 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('guardrail_defaults.configure'),
  ('governance_change.confirm'),
  ('catalogue_item.read'),
  ('cost_data.read'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('approval.approve'),
  ('approval.reject'),
  ('approval.request_changes'),
  ('override.approve'),
  ('override.revoke'),
  ('margin_guardrail.read'),
  ('policy_guardrail.manage'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('comment.create'),
  ('assignment.assign'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'commercial_approver'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Executive Approver (19 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('governance_change.confirm'),
  ('catalogue_item.read'),
  ('cost_data.read'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('approval.approve'),
  ('approval.reject'),
  ('approval.request_changes'),
  ('override.approve'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('comment.create'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'executive_approver'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Executor (12 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('catalogue_item.read'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('override.request'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('execution.mark_implemented'),
  ('execution.schedule'),
  ('comment.create'),
  ('report.export'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'executor'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Viewer (6 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('catalogue_item.read'),
  ('proposal.read'),
  ('pricing_rule.read'),
  ('policy_guardrail.read'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'viewer'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- Auditor (15 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('org_settings.read'),
  ('catalogue_item.read'),
  ('catalogue_item.export'),
  ('cost_data.read'),
  ('proposal.read'),
  ('proposal.version_history_read'),
  ('pricing_rule.read'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('audit_trail.read'),
  ('audit_pack.export'),
  ('report.export'),
  ('ai_assistance.invoke'),
  ('vendor.read'),
  ('notification_prefs.manage_own')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'auditor'
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- AI Assistant (12 grants)
INSERT INTO rbac.role_permission (role_id, permission_name)
SELECT r.id, p.permission_name
FROM rbac.role r, (VALUES
  ('catalogue_item.read'),
  ('cost_data.read'),
  ('proposal.create_draft'),
  ('proposal.read'),
  ('proposal.edit_draft'),
  ('pricing_rule.create_draft'),
  ('pricing_rule.read'),
  ('pricing_rule.edit_draft'),
  ('margin_guardrail.read'),
  ('policy_guardrail.read'),
  ('template.use'),
  ('comment.create')
) AS p(permission_name)
WHERE r.org_id IS NULL AND r.code = 'ai_assistant'
ON CONFLICT (role_id, permission_name) DO NOTHING;

