import { create, toJson } from "@bufbuild/protobuf";
import multipart, { type Multipart } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DataPipelineService,
  GetColumnProfileResponseSchema,
  GetImportBatchResponseSchema,
  GetImportOperationResponseSchema,
  ImportBatchStatus,
  ImportSourceType,
  ListImportBatchesResponseSchema,
  MappingTemplateSchema,
  UploadImportFileRequestSchema,
  type MappingTemplate,
  type UploadImportFileRequest,
} from "@owomide/proto/services/data_pipeline/v1/data_pipeline_pb.js";
import { createServiceClient } from "../clients/factory.js";
import { dataPipelineServiceToken } from "../clients/service-auth.js";
import type { Config } from "../config.js";

const statusByName: Readonly<Record<string, ImportBatchStatus>> = {
  uploaded: ImportBatchStatus.UPLOADED,
  parsing: ImportBatchStatus.PARSING,
  profiled: ImportBatchStatus.PROFILED,
  mapped: ImportBatchStatus.MAPPED,
  validated: ImportBatchStatus.VALIDATED,
  committing: ImportBatchStatus.COMMITTING,
  committed: ImportBatchStatus.COMMITTED,
  failed: ImportBatchStatus.FAILED,
  discarded: ImportBatchStatus.DISCARDED,
};

type MultipartRequest = FastifyRequest & {
  parts: () => AsyncIterableIterator<Multipart>;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidArgument(reply: FastifyReply, message: string) {
  return reply.status(400).send({
    code: "INVALID_ARGUMENT",
    message,
    details: [],
  });
}

function pageSize(raw: string | undefined): number | null {
  const value = raw ? Number(raw) : 0;
  return Number.isInteger(value) && value >= 0 && value <= 200 ? value : null;
}

function mappingTemplateJson(template: MappingTemplate) {
  const serialized = toJson(MappingTemplateSchema, template) as JsonObject;
  const { mappingsJson, transformationRulesJson, ...metadata } = serialized;
  return {
    ...metadata,
    mappings: JSON.parse(String(mappingsJson)) as JsonObject,
    transformationRules: JSON.parse(String(transformationRulesJson)) as unknown[],
  };
}

function serviceHeaders(request: FastifyRequest, token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "x-org-id": request.ctx.orgId,
    "x-user-id": request.ctx.userId,
    "x-user-roles": request.ctx.roles.join(","),
  };
}

function sourceType(filename: string): ImportSourceType {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "csv") return ImportSourceType.CSV;
  if (extension === "xlsx") return ImportSourceType.XLSX;
  const error = new Error("Only CSV and XLSX uploads are supported") as Error & {
    statusCode: number;
  };
  error.statusCode = 400;
  throw error;
}

export interface DataPipelineRouteDependencies {
  client?: ReturnType<typeof createServiceClient>;
  token?: () => Promise<string>;
}

export async function registerDataPipelineRoutes(
  app: FastifyInstance,
  config: Config,
  dependencies: DataPipelineRouteDependencies = {}
) {
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 3,
      parts: 4,
      fileSize: config.dataPipelineUploadMaxBytes,
    },
  });
  const client =
    dependencies.client ?? createServiceClient(DataPipelineService, config.dataPipelineServiceUrl);
  const token = dependencies.token ?? (() => dataPipelineServiceToken(config));

  app.post("/imports", async (request, reply) => {
    const query = request.query as {
      sourceSystem?: string;
      channelId?: string;
      customerSegmentId?: string;
    };
    const fields: Record<string, string | undefined> = {
      sourceSystem: query.sourceSystem,
      channelId: query.channelId,
      customerSegmentId: query.customerSegmentId,
    };
    let fileSeen = false;

    async function* uploadRequests(): AsyncGenerator<UploadImportFileRequest> {
      for await (const part of (request as MultipartRequest).parts()) {
        if (part.type === "field") {
          if (fileSeen) {
            throw Object.assign(new Error("Import metadata fields must precede the file"), {
              statusCode: 400,
            });
          }
          if (!(part.fieldname in fields) || typeof part.value !== "string") {
            throw Object.assign(new Error(`Unsupported import field: ${part.fieldname}`), {
              statusCode: 400,
            });
          }
          fields[part.fieldname] = part.value;
          continue;
        }
        if (fileSeen) {
          throw Object.assign(new Error("Exactly one import file is required"), {
            statusCode: 400,
          });
        }
        fileSeen = true;
        yield create(UploadImportFileRequestSchema, {
          payload: {
            case: "metadata",
            value: {
              sourceFilename: part.filename,
              sourceType: sourceType(part.filename),
              sourceSystem: fields["sourceSystem"] || undefined,
              channelId: fields["channelId"] || undefined,
              customerSegmentId: fields["customerSegmentId"] || undefined,
            },
          },
        });
        for await (const chunk of part.file) {
          yield create(UploadImportFileRequestSchema, {
            payload: { case: "chunk", value: new Uint8Array(chunk) },
          });
        }
        if (part.file.truncated) {
          throw Object.assign(new Error("Import file exceeds the configured upload limit"), {
            statusCode: 413,
          });
        }
      }
      if (!fileSeen) {
        throw Object.assign(new Error("Exactly one import file is required"), {
          statusCode: 400,
        });
      }
    }

    const result = await client.uploadImportFile(uploadRequests(), {
      headers: serviceHeaders(request, await token()),
    });
    return reply.status(202).send({
      batchId: result.batchId,
      operationId: result.operationId,
      status: "uploaded",
    });
  });

  app.get("/imports", async (request, reply) => {
    const query = request.query as {
      status?: string;
      pageSize?: string;
      pageToken?: string;
    };
    let status = ImportBatchStatus.UNSPECIFIED;
    if (query.status) {
      status = statusByName[query.status.toLowerCase()] ?? ImportBatchStatus.UNSPECIFIED;
      if (status === ImportBatchStatus.UNSPECIFIED) {
        return reply.status(400).send({
          code: "INVALID_ARGUMENT",
          message: "Import status is invalid",
          details: [],
        });
      }
    }
    const requestedPageSize = pageSize(query.pageSize);
    if (requestedPageSize === null) {
      return invalidArgument(reply, "pageSize must be an integer between 0 and 200");
    }
    const result = await client.listImportBatches(
      {
        status,
        pagination: {
          pageSize: requestedPageSize,
          pageToken: query.pageToken ?? "",
        },
      },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.send(toJson(ListImportBatchesResponseSchema, result));
  });

  app.get("/imports/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await client.getImportBatch(
      { batchId: id },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.send(toJson(GetImportBatchResponseSchema, result));
  });

  app.get("/imports/:id/profile", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await client.getColumnProfile(
      { batchId: id },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.send(toJson(GetColumnProfileResponseSchema, result));
  });

  app.put("/imports/:id/mapping", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isJsonObject(request.body)) {
      return invalidArgument(reply, "Request body must be a JSON object");
    }
    const { templateId, mappings, transformationRules } = request.body;
    const hasTemplate = typeof templateId === "string" && templateId.trim() !== "";
    const hasMappings = isJsonObject(mappings);
    if (hasTemplate === hasMappings) {
      return invalidArgument(reply, "Provide exactly one of templateId or mappings");
    }
    if (templateId !== undefined && !hasTemplate) {
      return invalidArgument(reply, "templateId must be a non-empty string");
    }
    if (mappings !== undefined && !hasMappings) {
      return invalidArgument(reply, "mappings must be a JSON object");
    }
    if (transformationRules !== undefined && !Array.isArray(transformationRules)) {
      return invalidArgument(reply, "transformationRules must be a JSON array");
    }
    if (hasTemplate && transformationRules !== undefined) {
      return invalidArgument(reply, "transformationRules cannot override a saved template");
    }

    const result = await client.applyMapping(
      {
        batchId: id,
        templateId: hasTemplate ? templateId.trim() : undefined,
        mappingsJson: hasMappings ? JSON.stringify(mappings) : undefined,
        transformationRulesJson: hasMappings
          ? JSON.stringify(transformationRules ?? [])
          : undefined,
      },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.status(202).send({
      batchId: result.batchId,
      operationId: result.operationId,
      status: "queued",
    });
  });

  app.get("/mappings", async (request, reply) => {
    const query = request.query as {
      sourceSystem?: string;
      channelId?: string;
      customerSegmentId?: string;
      pageSize?: string;
      pageToken?: string;
    };
    const requestedPageSize = pageSize(query.pageSize);
    if (requestedPageSize === null) {
      return invalidArgument(reply, "pageSize must be an integer between 0 and 200");
    }
    const result = await client.listMappingTemplates(
      {
        sourceSystem: query.sourceSystem || undefined,
        channelId: query.channelId || undefined,
        customerSegmentId: query.customerSegmentId || undefined,
        pagination: {
          pageSize: requestedPageSize,
          pageToken: query.pageToken ?? "",
        },
      },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.send({
      templates: result.templates.map(mappingTemplateJson),
      pagination: result.pagination,
    });
  });

  app.post("/mappings", async (request, reply) => {
    if (!isJsonObject(request.body)) {
      return invalidArgument(reply, "Request body must be a JSON object");
    }
    const { id, name, sourceSystem, channelId, customerSegmentId, mappings, transformationRules } =
      request.body;
    if (typeof name !== "string" || !name.trim()) {
      return invalidArgument(reply, "name must be a non-empty string");
    }
    if (id !== undefined && (typeof id !== "string" || !id.trim())) {
      return invalidArgument(reply, "id must be a non-empty string");
    }
    if (!isJsonObject(mappings)) {
      return invalidArgument(reply, "mappings must be a JSON object");
    }
    if (transformationRules !== undefined && !Array.isArray(transformationRules)) {
      return invalidArgument(reply, "transformationRules must be a JSON array");
    }
    for (const [field, value] of Object.entries({
      id,
      sourceSystem,
      channelId,
      customerSegmentId,
    })) {
      if (value !== undefined && typeof value !== "string") {
        return invalidArgument(reply, `${field} must be a string`);
      }
    }

    const result = await client.saveMappingTemplate(
      {
        id: typeof id === "string" ? id.trim() : undefined,
        name: name.trim(),
        sourceSystem: typeof sourceSystem === "string" && sourceSystem ? sourceSystem : undefined,
        channelId: typeof channelId === "string" && channelId ? channelId : undefined,
        customerSegmentId:
          typeof customerSegmentId === "string" && customerSegmentId
            ? customerSegmentId
            : undefined,
        mappingsJson: JSON.stringify(mappings),
        transformationRulesJson: JSON.stringify(transformationRules ?? []),
      },
      { headers: serviceHeaders(request, await token()) }
    );
    return reply.status(id ? 200 : 201).send({
      template: result.template ? mappingTemplateJson(result.template) : undefined,
    });
  });

  app.get("/imports/:batchId/operations/:operationId", async (request, reply) => {
    const { batchId, operationId } = request.params as { batchId: string; operationId: string };
    const result = await client.getImportOperation(
      { operationId },
      { headers: serviceHeaders(request, await token()) }
    );
    if (!result.operation || result.operation.batchId !== batchId) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Import operation not found",
        details: [],
      });
    }
    return reply.send(toJson(GetImportOperationResponseSchema, result));
  });

  app.all("/mappings/*", async (_request, reply) => {
    return reply.status(501).send({
      code: "UNIMPLEMENTED",
      message: "This Data Pipeline feature is not yet implemented",
      details: [],
    });
  });

  const deferredPrefixes = ["/exports", "/intelligence"];
  for (const prefix of deferredPrefixes) {
    app.all(prefix, async (_request, reply) => {
      return reply.status(501).send({
        code: "UNIMPLEMENTED",
        message: "This Data Pipeline feature is not yet implemented",
        details: [],
      });
    });
    app.all(`${prefix}/*`, async (_request, reply) => {
      return reply.status(501).send({
        code: "UNIMPLEMENTED",
        message: "This Data Pipeline feature is not yet implemented",
        details: [],
      });
    });
  }
}
