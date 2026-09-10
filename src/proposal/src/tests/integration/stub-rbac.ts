import type { RbacClient } from "../../clients/rbac.js";

/**
 * In-memory stand-in for the rbac service. Constructed with a role → granted
 * permissions map; `checkPermission` is true if any of the caller's roles
 * grants the permission. Mirrors the real service's additive, default-deny
 * semantics without a network hop.
 */
export class StubRbacClient implements RbacClient {
  constructor(private readonly grants: Readonly<Record<string, readonly string[]>> = DEFAULT_GRANTS) {}

  async checkPermission(roles: readonly string[], permission: string): Promise<boolean> {
    return roles.some((role) => this.grants[role]?.includes(permission) ?? false);
  }
}

// Just the grants the proposal integration tests exercise — not the full matrix.
const DEFAULT_GRANTS: Readonly<Record<string, readonly string[]>> = {
  pricing_manager: [
    "proposal.create_draft",
    "proposal.read",
    "proposal.edit_draft",
    "proposal.delete_draft",
    "proposal.submit",
    "override.request",
    "comment.create",
    "execution.schedule",
  ],
  pricing_analyst: [
    "proposal.create_draft",
    "proposal.read",
    "proposal.edit_draft",
    "proposal.delete_draft",
    "comment.create",
  ],
  finance_approver: [
    "proposal.read",
    "approval.approve",
    "override.approve",
    "comment.create",
  ],
  executor: [
    "proposal.read",
    "execution.mark_implemented",
    "execution.schedule",
    "comment.create",
  ],
};
