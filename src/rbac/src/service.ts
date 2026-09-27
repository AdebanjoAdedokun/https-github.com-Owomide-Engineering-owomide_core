import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import {
  CheckPermissionResponseSchema,
  Permission,
  RbacService,
  type CheckPermissionRequest,
} from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import { requestContext, ServiceAuthenticator } from "./context.js";
import { Database } from "./db.js";
import { CODE_BY_PERMISSION } from "./permissions.js";
import { RoleRepository } from "./repo/role-repository.js";
import { isForbiddenUnderSupportAccess } from "./support-access.js";

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
        if (request.permission === Permission.UNSPECIFIED) {
          throw new ConnectError("permission is required", Code.InvalidArgument);
        }
        const permission = CODE_BY_PERMISSION[request.permission];
        if (!permission) {
          throw new ConnectError(`Unknown permission: ${request.permission}`, Code.InvalidArgument);
        }
        if (ctx.supportGrantId && isForbiddenUnderSupportAccess(permission)) {
          return create(CheckPermissionResponseSchema, { allowed: false });
        }
        const roleCodes = request.roles.map((role: string) => role.trim()).filter(Boolean);
        const allowed = await this.database.withOrgTransaction(ctx.orgId, (client) =>
          this.roles.hasPermission(client, roleCodes, permission)
        );
        return create(CheckPermissionResponseSchema, { allowed });
      },
    };
  }
}
