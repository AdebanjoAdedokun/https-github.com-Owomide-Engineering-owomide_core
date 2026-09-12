import { Permission } from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import type { RbacClient } from "../../clients/rbac.js";

/**
 * In-memory stand-in for the rbac service. Constructed with a role → granted
 * permissions map; `checkPermission` is true if any of the caller's roles
 * grants the permission. Mirrors the real service's additive, default-deny
 * semantics without a network hop.
 */
export class StubRbacClient implements RbacClient {
  constructor(private readonly grants: Readonly<Record<string, readonly Permission[]>> = DEFAULT_GRANTS) {}

  async checkPermission(roles: readonly string[], permission: Permission): Promise<boolean> {
    return roles.some((role) => this.grants[role]?.includes(permission) ?? false);
  }
}

// Just the grants the proposal integration tests exercise — not the full matrix.
const DEFAULT_GRANTS: Readonly<Record<string, readonly Permission[]>> = {
  pricing_manager: [
    Permission.PROPOSAL_CREATE_DRAFT,
    Permission.PROPOSAL_READ,
    Permission.PROPOSAL_EDIT_DRAFT,
    Permission.PROPOSAL_DELETE_DRAFT,
    Permission.PROPOSAL_SUBMIT,
    Permission.OVERRIDE_REQUEST,
    Permission.COMMENT_CREATE,
    Permission.EXECUTION_SCHEDULE,
  ],
  pricing_analyst: [
    Permission.PROPOSAL_CREATE_DRAFT,
    Permission.PROPOSAL_READ,
    Permission.PROPOSAL_EDIT_DRAFT,
    Permission.PROPOSAL_DELETE_DRAFT,
    Permission.COMMENT_CREATE,
  ],
  finance_approver: [
    Permission.PROPOSAL_READ,
    Permission.APPROVAL_APPROVE,
    Permission.OVERRIDE_APPROVE,
    Permission.COMMENT_CREATE,
  ],
  executor: [
    Permission.PROPOSAL_READ,
    Permission.EXECUTION_MARK_IMPLEMENTED,
    Permission.EXECUTION_SCHEDULE,
    Permission.COMMENT_CREATE,
  ],
};
