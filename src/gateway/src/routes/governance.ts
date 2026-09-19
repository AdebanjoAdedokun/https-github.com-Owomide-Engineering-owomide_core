import type { FastifyInstance } from "fastify";
import {
  GovernanceService,
  GetActivityFeedRequestSchema,
  GetEntityHistoryRequestSchema,
  ListSnapshotsRequestSchema,
  RestoreRequestSchema,
} from "@owomide/proto/services/governance/v1/governance_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createServiceClient } from "../clients/factory.js";
import { governanceServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type Pagination = { pageSize?: number; pageToken?: string };

type GovernanceClient = {
  getActivityFeed(req: MessageInitShape<typeof GetActivityFeedRequestSchema>, opts: Hdr): Promise<object>;
  getEntityHistory(req: MessageInitShape<typeof GetEntityHistoryRequestSchema>, opts: Hdr): Promise<object>;
  listSnapshots(req: MessageInitShape<typeof ListSnapshotsRequestSchema>, opts: Hdr): Promise<object>;
  restore(req: MessageInitShape<typeof RestoreRequestSchema>, opts: Hdr): Promise<object>;
};

function parsePagination(pageSize: string | undefined, pageToken: string | undefined): Pagination | undefined {
  if (!pageSize && !pageToken) return undefined;
  return { pageSize: pageSize ? parseInt(pageSize, 10) : undefined, pageToken };
}

export interface GovernanceRouteDependencies {
  client?: object;
  token?: () => Promise<string>;
}

export async function registerGovernanceRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: GovernanceRouteDependencies = {}
) {
  const client = (dependencies.client ??
    createServiceClient(GovernanceService, config.governanceServiceUrl)) as object as GovernanceClient;
  const token = dependencies.token ?? (() => governanceServiceToken(config));
  const headers = async (req: {
    ctx: { orgId: string; userId: string; roles: string[] };
  }): Promise<Hdr> => ({
    headers: {
      authorization: `Bearer ${await token()}`,
      "x-org-id": req.ctx.orgId,
      "x-user-id": req.ctx.userId,
      "x-user-roles": req.ctx.roles.join(","),
    },
  });

  app.get<{ Querystring: { entityType?: string; actorId?: string; from?: string; to?: string; pageSize?: string; pageToken?: string } }>("/governance/activity", async (req, reply) => {
    const { entityType, actorId, from, to, pageSize, pageToken } = req.query;
    const result = await client.getActivityFeed({
      entityType,
      actorId,
      from: from ? timestampFromDate(new Date(from)) : undefined,
      to: to ? timestampFromDate(new Date(to)) : undefined,
      pagination: parsePagination(pageSize, pageToken),
    }, await headers(req));
    return reply.send(result);
  });

  app.get<{ Params: { entityId: string }; Querystring: { entityType?: string; pageSize?: string; pageToken?: string } }>("/governance/history/:entityId", async (req, reply) => {
    const { entityType, pageSize, pageToken } = req.query;
    const result = await client.getEntityHistory({
      entityId: req.params.entityId,
      entityType,
      pagination: parsePagination(pageSize, pageToken),
    }, await headers(req));
    return reply.send(result);
  });

  app.get<{ Querystring: { pageSize?: string; pageToken?: string } }>("/governance/snapshots", async (req, reply) => {
    const { pageSize, pageToken } = req.query;
    const result = await client.listSnapshots({
      pagination: parsePagination(pageSize, pageToken),
    }, await headers(req));
    return reply.send(result);
  });

  app.post<{ Body: { snapshotId?: string; targetTimestamp?: string; targetEnvironment?: string; approvalId?: string } }>("/governance/restore", async (req, reply) => {
    const result = await client.restore({
      snapshotId: req.body.snapshotId,
      targetTimestamp: req.body.targetTimestamp ? timestampFromDate(new Date(req.body.targetTimestamp)) : undefined,
      targetEnvironment: req.body.targetEnvironment,
      approvalId: req.body.approvalId,
    }, await headers(req));
    return reply.send(result);
  });
}
