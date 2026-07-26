import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type pg from "pg";
import type pino from "pino";
import {
  GovernanceService,
  type RestoreRequest,
} from "@owomide/proto/services/governance/v1/governance_pb.js";
import type { ObjectStore } from "./clients/object-store.js";
import type { CatalogRestoreClient } from "./clients/catalog.js";
import { requestContext } from "./context.js";
import { handleRestore } from "./handlers/restore.js";

export interface GovernanceServiceDeps {
  pool: pg.Pool;
  objectStore: ObjectStore;
  catalogClient: CatalogRestoreClient;
  logger: pino.Logger;
}

export class GovernanceServiceImpl {
  readonly implementation: ServiceImpl<typeof GovernanceService>;

  constructor(deps: GovernanceServiceDeps) {
    this.implementation = {
      getActivityFeed: async () => {
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      getEntityHistory: async () => {
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      listSnapshots: async () => {
        throw new ConnectError("Not implemented", Code.Unimplemented);
      },
      restore: async (request: RestoreRequest, context: HandlerContext) => {
        const ctx = requestContext(context);
        return handleRestore(ctx, deps, request);
      },
    };
  }
}
