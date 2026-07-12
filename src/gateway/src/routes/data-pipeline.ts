import { create, toJson } from "@bufbuild/protobuf";
import multipart, { type Multipart } from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  DataPipelineService,
  GetImportBatchResponseSchema,
  GetImportOperationResponseSchema,
  ImportBatchStatus,
  ImportSourceType,
  ListImportBatchesResponseSchema,
  UploadImportFileRequestSchema,
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
    const pageSize = query.pageSize ? Number(query.pageSize) : 0;
    if (!Number.isInteger(pageSize) || pageSize < 0 || pageSize > 200) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "pageSize must be an integer between 0 and 200",
        details: [],
      });
    }
    const result = await client.listImportBatches(
      {
        status,
        pagination: {
          pageSize,
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

  const deferredPrefixes = ["/mappings", "/exports", "/intelligence"];
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
