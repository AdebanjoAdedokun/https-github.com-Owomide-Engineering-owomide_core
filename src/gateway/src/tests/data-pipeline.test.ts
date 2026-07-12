import { create } from "@bufbuild/protobuf";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  GetColumnProfileResponseSchema,
  GetImportOperationResponseSchema,
  ImportBatchStatus,
  UploadImportFileResponseSchema,
  type UploadImportFileRequest,
} from "@owomide/proto/services/data_pipeline/v1/data_pipeline_pb.js";
import { loadConfig } from "../config.js";
import type { RequestContext } from "../context.js";
import { registerErrorEnvelope } from "../middleware/error-envelope.js";
import { registerDataPipelineRoutes } from "../routes/data-pipeline.js";

function multipartBody(
  boundary: string,
  filename: string,
  content: string,
  fields: Record<string, string> = {}
): Buffer {
  const chunks: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n--${boundary}--\r\n`
  );
  return Buffer.from(chunks.join(""));
}

async function testApp(maxBytes = 1024, operationBatchId = "batch-1") {
  const app = Fastify();
  app.decorateRequest("ctx", undefined as unknown as RequestContext);
  app.addHook("onRequest", async (request) => {
    request.ctx = { orgId: "org-test", userId: "user-test", roles: ["admin"] };
  });
  registerErrorEnvelope(app);

  const captured: UploadImportFileRequest[] = [];
  let capturedHeaders: unknown;
  let profileBatchId: string | undefined;
  const client = {
    async uploadImportFile(
      requests: AsyncIterable<UploadImportFileRequest>,
      options: { headers?: unknown }
    ) {
      capturedHeaders = options.headers;
      for await (const request of requests) captured.push(request);
      return create(UploadImportFileResponseSchema, {
        batchId: "batch-1",
        operationId: "operation-1",
        status: ImportBatchStatus.UPLOADED,
      });
    },
    async getImportOperation() {
      return create(GetImportOperationResponseSchema, {
        operation: {
          id: "operation-1",
          orgId: "org-test",
          batchId: operationBatchId,
        },
      });
    },
    async getColumnProfile(request: { batchId: string }) {
      profileBatchId = request.batchId;
      return create(GetColumnProfileResponseSchema, {
        columns: [
          {
            id: "profile-1",
            orgId: "org-test",
            batchId: request.batchId,
            columnName: "SKU",
            ordinalPosition: 1,
            detectedType: "string",
            suggestedMapping: "sku.sku_code",
            confidence: 0.98,
          },
        ],
      });
    },
  };
  const config = { ...loadConfig(), dataPipelineUploadMaxBytes: maxBytes };
  await registerDataPipelineRoutes(app, config, {
    client,
    token: async () => "service-token",
  });
  return {
    app,
    captured,
    headers: () => capturedHeaders,
    profileBatchId: () => profileBatchId,
  };
}

describe("Data Pipeline routes", () => {
  it("streams multipart metadata and file bytes to Data Pipeline", async () => {
    const { app, captured, headers } = await testApp();
    const boundary = "owomide-test-boundary";

    const response = await app.inject({
      method: "POST",
      url: "/imports",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, "prices.csv", "SKU,Price\nA-1,100\n", {
        sourceSystem: "erp",
      }),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      batchId: "batch-1",
      operationId: "operation-1",
      status: "uploaded",
    });
    expect(captured[0]?.payload.case).toBe("metadata");
    expect(captured[0]?.payload.value).toMatchObject({
      sourceFilename: "prices.csv",
      sourceSystem: "erp",
    });
    const chunks = captured.flatMap((message) =>
      message.payload.case === "chunk" ? [Buffer.from(message.payload.value)] : []
    );
    expect(Buffer.concat(chunks).toString()).toBe("SKU,Price\nA-1,100\n");
    expect(headers()).toMatchObject({
      authorization: "Bearer service-token",
      "x-org-id": "org-test",
      "x-user-id": "user-test",
    });
    await app.close();
  });

  it("rejects files over the configured gateway limit", async () => {
    const { app } = await testApp(4);
    const boundary = "owomide-test-boundary";

    const response = await app.inject({
      method: "POST",
      url: "/imports",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, "prices.csv", "12345"),
    });

    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it("does not return an operation through a different batch URL", async () => {
    const { app } = await testApp(1024, "batch-1");

    const response = await app.inject({
      method: "GET",
      url: "/imports/batch-2/operations/operation-1",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
    await app.close();
  });

  it("returns a batch column profile", async () => {
    const { app, profileBatchId } = await testApp();

    const response = await app.inject({
      method: "GET",
      url: "/imports/batch-1/profile",
    });

    expect(response.statusCode).toBe(200);
    expect(profileBatchId()).toBe("batch-1");
    expect(response.json()).toMatchObject({
      columns: [
        {
          columnName: "SKU",
          ordinalPosition: 1,
          suggestedMapping: "sku.sku_code",
        },
      ],
    });
    await app.close();
  });
});
