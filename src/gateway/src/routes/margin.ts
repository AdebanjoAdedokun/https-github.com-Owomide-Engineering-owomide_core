import type { FastifyInstance } from "fastify";
import {
  fromJson,
  toJson,
  type DescMessage,
  type JsonValue,
  type MessageInitShape,
  type MessageShape,
} from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  MarginService,
  ValidateBatchRequestSchema,
  ValidateBatchResponseSchema,
  ListRulesRequestSchema,
  ListRulesResponseSchema,
  UpsertRuleRequestSchema,
  UpsertRuleResponseSchema,
  DeactivateRuleRequestSchema,
  DeactivateRuleResponseSchema,
  type ValidateBatchResponse,
  type ListRulesResponse,
  type UpsertRuleResponse,
  type DeactivateRuleResponse,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import { createServiceClient } from "../clients/factory.js";
import { marginServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

function parseRequest<Desc extends DescMessage>(schema: Desc, value: unknown): MessageShape<Desc> {
  try {
    return fromJson(schema, value as JsonValue);
  } catch {
    throw new ConnectError("Invalid Margin request payload", Code.InvalidArgument);
  }
}

interface MarginClient {
  validateBatch(
    req: MessageInitShape<typeof ValidateBatchRequestSchema>,
    opts: Hdr
  ): Promise<ValidateBatchResponse>;
  listRules(
    req: MessageInitShape<typeof ListRulesRequestSchema>,
    opts: Hdr
  ): Promise<ListRulesResponse>;
  upsertRule(
    req: MessageInitShape<typeof UpsertRuleRequestSchema>,
    opts: Hdr
  ): Promise<UpsertRuleResponse>;
  deactivateRule(
    req: MessageInitShape<typeof DeactivateRuleRequestSchema>,
    opts: Hdr
  ): Promise<DeactivateRuleResponse>;
}

export interface MarginRouteDependencies {
  client?: object;
  token?: () => Promise<string>;
}

export async function registerMarginRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: MarginRouteDependencies = {}
) {
  const client = (dependencies.client ??
    createServiceClient(MarginService, config.marginServiceUrl)) as object as MarginClient;
  const token = dependencies.token ?? (() => marginServiceToken(config));
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

  app.post<{ Body: MessageInitShape<typeof ValidateBatchRequestSchema> }>(
    "/margin/validate",
    async (req, reply) => {
      const request = parseRequest(ValidateBatchRequestSchema, req.body);
      const result = await client.validateBatch(request, await headers(req));
      return reply.send(toJson(ValidateBatchResponseSchema, result));
    }
  );

  app.get<{ Querystring: MessageInitShape<typeof ListRulesRequestSchema> }>(
    "/margin/rules",
    async (req, reply) => {
      const request = parseRequest(ListRulesRequestSchema, req.query);
      const result = await client.listRules(request, await headers(req));
      return reply.send(toJson(ListRulesResponseSchema, result));
    }
  );

  app.put<{ Body: MessageInitShape<typeof UpsertRuleRequestSchema> }>(
    "/margin/rules",
    async (req, reply) => {
      const request = parseRequest(UpsertRuleRequestSchema, req.body);
      const result = await client.upsertRule(request, await headers(req));
      return reply.send(toJson(UpsertRuleResponseSchema, result));
    }
  );

  app.delete<{ Params: { id: string } }>("/margin/rules/:id", async (req, reply) => {
    const result = await client.deactivateRule({ id: req.params.id }, await headers(req));
    return reply.send(toJson(DeactivateRuleResponseSchema, result));
  });
}
