import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type pg from "pg";
import type pino from "pino";
import {
  GovernanceService,
  type RestoreRequest,
} from "@owomide/proto/services/governance/v1/governance_pb.js";
import type { ObjectStore } from "./clients/object-store.js";
import type { CatalogRestoreClient } from "./clients/catalog.js";
import type { RbacClient } from "./clients/rbac.js";
import { Permission } from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import {
  requestContext,
  requirePermission,
  ServiceAuthenticator,
  type RequestContext,
} from "./context.js";
import { handleRestore } from "./handlers/restore.js";

// Governance is called only by the gateway (end-user actions) today.
const CALLERS = ["gateway_svc"] as const;

export interface GovernanceServiceDeps {
  pool: pg.Pool;
  objectStore: ObjectStore;
  catalogClient: CatalogRestoreClient;
  authenticator: ServiceAuthenticator;
  rbacClient?: RbacClient;
  logger: pino.Logger;
}

export class GovernanceServiceImpl {
  readonly implementation: ServiceImpl<typeof GovernanceService>;

  constructor(deps: GovernanceServiceDeps) {
    this.implementation = {
      getActivityFeed: async (_request: unknown, context: HandlerContext) => {
        await this.gate(deps, context, Permission.AUDIT_TRAIL_READ);
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      getEntityHistory: async (_request: unknown, context: HandlerContext) => {
        await this.gate(deps, context, Permission.AUDIT_TRAIL_READ);
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      listSnapshots: async (_request: unknown, context: HandlerContext) => {
        await this.gate(deps, context, Permission.AUDIT_TRAIL_READ);
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      restore: async (request: RestoreRequest, context: HandlerContext) => {
        const ctx = await this.gate(deps, context, Permission.PLATFORM_RESTORE);
        return handleRestore(ctx, deps, request);
      },
    };
  }

  private async gate(
    deps: GovernanceServiceDeps,
    context: HandlerContext,
    permission: Permission
  ): Promise<RequestContext> {
    await deps.authenticator.authorize(context, CALLERS);
    const ctx = requestContext(context);
    if (deps.rbacClient) {
      const headers = new Headers();
      headers.set("x-org-id", ctx.orgId);
      headers.set("x-user-id", ctx.userId);
      headers.set("x-user-roles", ctx.roles.join(","));
      await requirePermission(deps.rbacClient, headers, ctx, permission);
    }
    return ctx;
  }
}
