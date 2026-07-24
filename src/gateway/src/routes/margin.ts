import type { FastifyInstance } from "fastify";
import {
  MarginService,
  ValidateBatchRequestSchema,
  ListRulesRequestSchema,
  UpsertRuleRequestSchema,
  DeactivateRuleRequestSchema,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { createServiceClient } from "../clients/factory.js";
import type { Config } from "../config.js";

type Hdr = { headers: Record<string, string> };

type MarginClient = {
  validateBatch(req: MessageInitShape<typeof ValidateBatchRequestSchema>, opts: Hdr): Promise<object>;
  listRules(req: MessageInitShape<typeof ListRulesRequestSchema>, opts: Hdr): Promise<object>;
  upsertRule(req: MessageInitShape<typeof UpsertRuleRequestSchema>, opts: Hdr): Promise<object>;
  deactivateRule(req: MessageInitShape<typeof DeactivateRuleRequestSchema>, opts: Hdr): Promise<object>;
};

function hdr(req: { ctx: { orgId: string; userId: string } }): Hdr {
  return { headers: { "x-org-id": req.ctx.orgId, "x-user-id": req.ctx.userId } };
}

export async function registerMarginRoutes(app: FastifyInstance, config: Config) {
  const client = createServiceClient(MarginService, config.marginServiceUrl) as object as MarginClient;

  app.post<{ Body: MessageInitShape<typeof ValidateBatchRequestSchema> }>("/margin/validate", async (req, reply) => {
    const result = await client.validateBatch(req.body, hdr(req));
    return reply.send(result);
  });

  app.get<{ Querystring: MessageInitShape<typeof ListRulesRequestSchema> }>("/margin/rules", async (req, reply) => {
    const result = await client.listRules(req.query, hdr(req));
    return reply.send(result);
  });

  app.put<{ Body: MessageInitShape<typeof UpsertRuleRequestSchema> }>("/margin/rules", async (req, reply) => {
    const result = await client.upsertRule(req.body, hdr(req));
    return reply.send(result);
  });

  app.delete<{ Params: { id: string } }>("/margin/rules/:id", async (req, reply) => {
    const result = await client.deactivateRule({ id: req.params.id }, hdr(req));
    return reply.send(result);
  });
}
