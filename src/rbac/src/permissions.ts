// GENERATED FROM docs/rbac/role_permissions.csv — transcribed once during F0.10.
// This is the permission catalog: every resource.action code the system knows about.
// Not a database table (v1 keeps this small and hand-maintained); used to validate that
// a CheckPermission call names a real permission. See src/rbac/CLAUDE.md.

export interface Permission {
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
  readonly category: string;
}

export const PERMISSIONS: readonly Permission[] = [
  {
    code: "org_settings.read",
    resource: "org_settings",
    action: "read",
    description: "View organisation-level settings: name, defaults, configured thresholds and routing.",
    category: "Organisation Settings",
  },
  {
    code: "org_settings.update",
    resource: "org_settings",
    action: "update",
    description: "Change organisation-level settings.",
    category: "Organisation Settings",
  },
  {
    code: "approval_routing.configure",
    resource: "approval_routing",
    action: "configure",
    description: "Configure approval magnitude thresholds and routing chains: sequential multi-domain chains, a single collapsed gate, or the within-guardrail auto-approval lane (open decision D8).",
    category: "Organisation Settings",
  },
  {
    code: "guardrail_defaults.configure",
    resource: "guardrail_defaults",
    action: "configure",
    description: "Set organisation-wide default guardrails that workspaces inherit.",
    category: "Organisation Settings",
  },
  {
    code: "governance_change.confirm",
    resource: "governance_change",
    action: "confirm",
    description: "Confirm a pending governance change (threshold, routing chain, guardrail, urgent route or emergency-authority grant) so that it becomes active. The confirming identity must differ from the configuring identity (rule R17).",
    category: "Organisation Settings",
  },
  {
    code: "org_user.invite",
    resource: "org_user",
    action: "invite",
    description: "Invite a new user into the tenant.",
    category: "Users and Roles",
  },
  {
    code: "org_user.deactivate",
    resource: "org_user",
    action: "deactivate",
    description: "Deactivate a user. Attribution in the audit trail is retained permanently (rule R7).",
    category: "Users and Roles",
  },
  {
    code: "org_user.assign_role",
    resource: "org_user",
    action: "assign_role",
    description: "Assign or change a user's roles, scopes and visibility flags.",
    category: "Users and Roles",
  },
  {
    code: "workspace.create",
    resource: "workspace",
    action: "create",
    description: "Create a new workspace.",
    category: "Workspaces",
  },
  {
    code: "workspace.archive",
    resource: "workspace",
    action: "archive",
    description: "Archive a workspace.",
    category: "Workspaces",
  },
  {
    code: "workspace.configure",
    resource: "workspace",
    action: "configure",
    description: "Configure workspace settings within organisation limits.",
    category: "Workspaces",
  },
  {
    code: "workspace.manage_members",
    resource: "workspace",
    action: "manage_members",
    description: "Add or remove workspace members and set their workspace scope.",
    category: "Workspaces",
  },
  {
    code: "catalogue_item.read",
    resource: "catalogue_item",
    action: "read",
    description: "Read products, services and tariffs on the shared board (list prices, attributes, status).",
    category: "Catalogue",
  },
  {
    code: "catalogue_item.manage",
    resource: "catalogue_item",
    action: "manage",
    description: "Create, edit or import catalogue items. No dedicated data steward role at prototype stage; revisit at MVP.",
    category: "Catalogue",
  },
  {
    code: "catalogue_item.export",
    resource: "catalogue_item",
    action: "export",
    description: "Export catalogue data. Subject to the high-risk export rule (R15).",
    category: "Catalogue",
  },
  {
    code: "cost_data.read",
    resource: "cost_data",
    action: "read",
    description: "Read cost and margin data. Governed by the orthogonal per-user cost visibility flag (rule R5).",
    category: "Cost Data",
  },
  {
    code: "cost_data.manage",
    resource: "cost_data",
    action: "manage",
    description: "Upload or edit cost data.",
    category: "Cost Data",
  },
  {
    code: "proposal.create_draft",
    resource: "proposal",
    action: "create_draft",
    description: "Create a new draft pricing proposal.",
    category: "Proposals",
  },
  {
    code: "proposal.read",
    resource: "proposal",
    action: "read",
    description: "Read proposal detail: lines, state, rationale, discussion.",
    category: "Proposals",
  },
  {
    code: "proposal.edit_draft",
    resource: "proposal",
    action: "edit_draft",
    description: "Edit a proposal still in draft state.",
    category: "Proposals",
  },
  {
    code: "proposal.delete_draft",
    resource: "proposal",
    action: "delete_draft",
    description: "Delete a draft proposal.",
    category: "Proposals",
  },
  {
    code: "proposal.submit",
    resource: "proposal",
    action: "submit",
    description: "Submit a draft into the approval workflow. Locks the draft. Routing then applies rule R2, including any within-guardrail lane the organisation has configured (D8). A change-set with any out-of-scope item is denied or split (rule R14).",
    category: "Proposals",
  },
  {
    code: "proposal.version_history_read",
    resource: "proposal",
    action: "version_history_read",
    description: "Read a proposal's full version history.",
    category: "Proposals",
  },
  {
    code: "pricing_rule.create_draft",
    resource: "pricing_rule",
    action: "create_draft",
    description: "Create a draft pricing rule, strategy, mandate or campaign in the plain-language builder. Campaigns are time-boxed and auto-revert (rule R12).",
    category: "Rules and Strategies",
  },
  {
    code: "pricing_rule.read",
    resource: "pricing_rule",
    action: "read",
    description: "Read pricing rules and strategies.",
    category: "Rules and Strategies",
  },
  {
    code: "pricing_rule.edit_draft",
    resource: "pricing_rule",
    action: "edit_draft",
    description: "Edit a rule or strategy still in draft state.",
    category: "Rules and Strategies",
  },
  {
    code: "pricing_rule.submit",
    resource: "pricing_rule",
    action: "submit",
    description: "Submit a rule or strategy into the approval workflow.",
    category: "Rules and Strategies",
  },
  {
    code: "approval.approve",
    resource: "approval",
    action: "approve",
    description: "Approve a submitted proposal or rule routed to this approver. The approval binds to the exact version reviewed; material edits invalidate it (rule R13).",
    category: "Approvals",
  },
  {
    code: "approval.reject",
    resource: "approval",
    action: "reject",
    description: "Reject a submitted proposal or rule routed to this approver.",
    category: "Approvals",
  },
  {
    code: "approval.request_changes",
    resource: "approval",
    action: "request_changes",
    description: "Return a submitted item to its author with required changes.",
    category: "Approvals",
  },
  {
    code: "override.request",
    resource: "override",
    action: "request",
    description: "Request a time-boxed override of a guardrail block.",
    category: "Overrides",
  },
  {
    code: "override.approve",
    resource: "override",
    action: "approve",
    description: "Approve an override request. Identity check: approver must differ from requester (rule R1).",
    category: "Overrides",
  },
  {
    code: "override.revoke",
    resource: "override",
    action: "revoke",
    description: "Revoke an active override before its expiry.",
    category: "Overrides",
  },
  {
    code: "margin_guardrail.manage",
    resource: "margin_guardrail",
    action: "manage",
    description: "Create, edit or delete margin and cost guardrails: floors, ceilings.",
    category: "Guardrails",
  },
  {
    code: "margin_guardrail.read",
    resource: "margin_guardrail",
    action: "read",
    description: "Read margin and cost guardrails.",
    category: "Guardrails",
  },
  {
    code: "policy_guardrail.manage",
    resource: "policy_guardrail",
    action: "manage",
    description: "Create, edit or delete commercial policy guardrails: MAP, parity, channel and regional rules.",
    category: "Guardrails",
  },
  {
    code: "policy_guardrail.read",
    resource: "policy_guardrail",
    action: "read",
    description: "Read commercial policy guardrails.",
    category: "Guardrails",
  },
  {
    code: "execution.mark_implemented",
    resource: "execution",
    action: "mark_implemented",
    description: "Record that an approved decision has been implemented: mark it and log it. Gated on approval status (rule R11). Live channel execution belongs to Layer 4 and does not exist at prototype stage; the verb says exactly what the prototype does.",
    category: "Execution",
  },
  {
    code: "execution.schedule",
    resource: "execution",
    action: "schedule",
    description: "Set or change the effective date of an approved change.",
    category: "Execution",
  },
  {
    code: "audit_trail.read",
    resource: "audit_trail",
    action: "read",
    description: "Read the audit trail: who did what, when, why, with what authority.",
    category: "Audit",
  },
  {
    code: "audit_pack.export",
    resource: "audit_pack",
    action: "export",
    description: "Export an audit pack for compliance or review. Subject to the high-risk export rule (R15).",
    category: "Audit",
  },
  {
    code: "template.manage",
    resource: "template",
    action: "manage",
    description: "Create, edit or retire proposal and rule templates.",
    category: "Templates",
  },
  {
    code: "template.use",
    resource: "template",
    action: "use",
    description: "Instantiate a template when drafting.",
    category: "Templates",
  },
  {
    code: "comment.create",
    resource: "comment",
    action: "create",
    description: "Comment on proposals, rules and catalogue items.",
    category: "Collaboration",
  },
  {
    code: "change_request.create",
    resource: "change_request",
    action: "create",
    description: "Raise a structured price-change request: item(s), direction, reason, supporting evidence. The intake lane for staff without pricing authority.",
    category: "Collaboration",
  },
  {
    code: "change_request.triage",
    resource: "change_request",
    action: "triage",
    description: "Convert a change request into a draft proposal, or dismiss it with a recorded reason. Every outcome is logged and the requester notified.",
    category: "Collaboration",
  },
  {
    code: "assignment.assign",
    resource: "assignment",
    action: "assign",
    description: "Assign an item or task to another user, with mention notifications.",
    category: "Collaboration",
  },
  {
    code: "report.export",
    resource: "report",
    action: "export",
    description: "Export reports and summaries. Export is high-risk: it inherits the exporter's scope and cost-visibility restrictions and is logged with actor, fields and row count (rule R15).",
    category: "Reports",
  },
  {
    code: "ai_assistance.invoke",
    resource: "ai_assistance",
    action: "invoke",
    description: "Invoke the AI Assistant to draft, summarise, flag risks or generate scenarios.",
    category: "AI Assistance",
  },
  {
    code: "vendor.read",
    resource: "vendor",
    action: "read",
    description: "Read vendor (third-party seller) registry records: identity, status, assigned category and territory.",
    category: "Vendors",
  },
  {
    code: "vendor.manage",
    resource: "vendor",
    action: "manage",
    description: "Create, edit or deactivate vendor registry records. Reference-data administration, not a pricing action.",
    category: "Vendors",
  },
  {
    code: "notification_prefs.manage_own",
    resource: "notification_prefs",
    action: "manage_own",
    description: "Read and update the user's own notification preferences.",
    category: "Notifications",
  },
  {
    code: "platform.provision_tenant",
    resource: "platform",
    action: "provision_tenant",
    description: "Provision or decommission a pilot tenant.",
    category: "Platform (Owómidé)",
  },
  {
    code: "platform.support_access",
    resource: "platform",
    action: "support_access",
    description: "Access a pilot tenant's data for support.",
    category: "Platform (Owómidé)",
  },
  {
    code: "platform.restore",
    resource: "platform",
    action: "restore",
    description: "Restore tenant state from a snapshot. Highest-risk action in the system.",
    category: "Platform (Owómidé)",
  },
];

const PERMISSION_CODES: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.code));

export function isKnownPermission(code: string): boolean {
  return PERMISSION_CODES.has(code);
}

// Maps the generated Permission enum (src/lib/proto/services/rbac/v1/rbac.proto)
// to the text code stored in rbac.role_permission.permission_name. Generated
// once alongside PERMISSIONS below — regenerate both together if the CSV changes.
export const CODE_BY_PERMISSION: Readonly<Record<number, string>> = {
  1: "org_settings.read", // Permission.ORG_SETTINGS_READ
  2: "org_settings.update", // Permission.ORG_SETTINGS_UPDATE
  3: "approval_routing.configure", // Permission.APPROVAL_ROUTING_CONFIGURE
  4: "guardrail_defaults.configure", // Permission.GUARDRAIL_DEFAULTS_CONFIGURE
  5: "governance_change.confirm", // Permission.GOVERNANCE_CHANGE_CONFIRM
  6: "org_user.invite", // Permission.ORG_USER_INVITE
  7: "org_user.deactivate", // Permission.ORG_USER_DEACTIVATE
  8: "org_user.assign_role", // Permission.ORG_USER_ASSIGN_ROLE
  9: "workspace.create", // Permission.WORKSPACE_CREATE
  10: "workspace.archive", // Permission.WORKSPACE_ARCHIVE
  11: "workspace.configure", // Permission.WORKSPACE_CONFIGURE
  12: "workspace.manage_members", // Permission.WORKSPACE_MANAGE_MEMBERS
  13: "catalogue_item.read", // Permission.CATALOGUE_ITEM_READ
  14: "catalogue_item.manage", // Permission.CATALOGUE_ITEM_MANAGE
  15: "catalogue_item.export", // Permission.CATALOGUE_ITEM_EXPORT
  16: "cost_data.read", // Permission.COST_DATA_READ
  17: "cost_data.manage", // Permission.COST_DATA_MANAGE
  18: "proposal.create_draft", // Permission.PROPOSAL_CREATE_DRAFT
  19: "proposal.read", // Permission.PROPOSAL_READ
  20: "proposal.edit_draft", // Permission.PROPOSAL_EDIT_DRAFT
  21: "proposal.delete_draft", // Permission.PROPOSAL_DELETE_DRAFT
  22: "proposal.submit", // Permission.PROPOSAL_SUBMIT
  23: "proposal.version_history_read", // Permission.PROPOSAL_VERSION_HISTORY_READ
  24: "pricing_rule.create_draft", // Permission.PRICING_RULE_CREATE_DRAFT
  25: "pricing_rule.read", // Permission.PRICING_RULE_READ
  26: "pricing_rule.edit_draft", // Permission.PRICING_RULE_EDIT_DRAFT
  27: "pricing_rule.submit", // Permission.PRICING_RULE_SUBMIT
  28: "approval.approve", // Permission.APPROVAL_APPROVE
  29: "approval.reject", // Permission.APPROVAL_REJECT
  30: "approval.request_changes", // Permission.APPROVAL_REQUEST_CHANGES
  31: "override.request", // Permission.OVERRIDE_REQUEST
  32: "override.approve", // Permission.OVERRIDE_APPROVE
  33: "override.revoke", // Permission.OVERRIDE_REVOKE
  34: "margin_guardrail.manage", // Permission.MARGIN_GUARDRAIL_MANAGE
  35: "margin_guardrail.read", // Permission.MARGIN_GUARDRAIL_READ
  36: "policy_guardrail.manage", // Permission.POLICY_GUARDRAIL_MANAGE
  37: "policy_guardrail.read", // Permission.POLICY_GUARDRAIL_READ
  38: "execution.mark_implemented", // Permission.EXECUTION_MARK_IMPLEMENTED
  39: "execution.schedule", // Permission.EXECUTION_SCHEDULE
  40: "audit_trail.read", // Permission.AUDIT_TRAIL_READ
  41: "audit_pack.export", // Permission.AUDIT_PACK_EXPORT
  42: "template.manage", // Permission.TEMPLATE_MANAGE
  43: "template.use", // Permission.TEMPLATE_USE
  44: "comment.create", // Permission.COMMENT_CREATE
  45: "change_request.create", // Permission.CHANGE_REQUEST_CREATE
  46: "change_request.triage", // Permission.CHANGE_REQUEST_TRIAGE
  47: "assignment.assign", // Permission.ASSIGNMENT_ASSIGN
  48: "report.export", // Permission.REPORT_EXPORT
  49: "ai_assistance.invoke", // Permission.AI_ASSISTANCE_INVOKE
  50: "vendor.read", // Permission.VENDOR_READ
  51: "vendor.manage", // Permission.VENDOR_MANAGE
  52: "notification_prefs.manage_own", // Permission.NOTIFICATION_PREFS_MANAGE_OWN
  53: "platform.provision_tenant", // Permission.PLATFORM_PROVISION_TENANT
  54: "platform.support_access", // Permission.PLATFORM_SUPPORT_ACCESS
  55: "platform.restore", // Permission.PLATFORM_RESTORE
};
