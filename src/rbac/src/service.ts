import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import {
  CheckPermissionResponseSchema,
  RbacService,
  type CheckPermissionRequest,
} from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import { requestContext, ServiceAuthenticator } from "./context.js";
import { Database } from "./db.js";
import { isKnownPermission } from "./permissions.js";
import { RoleRepository } from "./repo/role-repository.js";

// Every backend service that gates an action calls CheckPermission.
const CHECK_CALLERS = [
  "gateway_svc",
  "proposal_svc",
  "governance_svc",
  "catalog_svc",
  "margin_svc",
] as const;

export class RbacServiceImpl {
  readonly implementation: ServiceImpl<typeof RbacService>;

  constructor(
    private readonly database: Database,
    private readonly authenticator: ServiceAuthenticator,
    private readonly roles = new RoleRepository()
  ) {
    this.implementation = {
      checkPermission: async (request: CheckPermissionRequest, context: HandlerContext) => {
        await this.authenticator.authorize(context, CHECK_CALLERS);
        const ctx = requestContext(context);
        const permission = request.permission.trim();
        if (!permission) {
          throw new ConnectError("permission is required", Code.InvalidArgument);
        }
        if (!isKnownPermission(permission)) {
          throw new ConnectError(`Unknown permission: ${permission}`, Code.InvalidArgument);
        }
        const roleCodes = request.roles.map((role) => role.trim()).filter(Boolean);
        const allowed = await this.database.withOrgTransaction(ctx.orgId, (client) =>
          this.roles.hasPermission(client, roleCodes, permission)
        );
        return create(CheckPermissionResponseSchema, { allowed });
      },
    };
  }
}
