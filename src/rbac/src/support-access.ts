// Owómidé support access (PRD ORG-015): time-boxed access that an organisation's Account Owner
// grants for a stated purpose. Whatever roles are otherwise present, support access never
// carries authority to submit, decide, authorise or record implementation of pricing work, or
// to confirm governance changes. The gateway marks such requests with x-support-grant-id.

export const SUPPORT_FORBIDDEN_PERMISSIONS: ReadonlySet<string> = new Set([
  "proposal.submit",
  "pricing_rule.submit",
  "approval.approve",
  "approval.reject",
  "approval.request_changes",
  "override.approve",
  "execution.mark_implemented",
  "execution.schedule",
  "governance_change.confirm",
  "org_user.assign_role",
  "org_user.invite",
  "org_user.deactivate",
]);

export function isForbiddenUnderSupportAccess(permissionCode: string): boolean {
  return SUPPORT_FORBIDDEN_PERMISSIONS.has(permissionCode);
}
