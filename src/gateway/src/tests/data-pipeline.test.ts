import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  ApplyMappingResponseSchema,
  CommitBatchResponseSchema,
  ConvertCurrencyResponseSchema,
  EditRowResponseSchema,
  ExcludeRowResponseSchema,
  GetColumnProfileResponseSchema,
  GetImportOperationResponseSchema,
  GetFxRateResponseSchema,
  GetValidationReportResponseSchema,
  ImportBatchStatus,
  ImportOperationStatus,
  ListMappingTemplatesResponseSchema,
  RecordFxRateSnapshotResponseSchema,
  SaveMappingTemplateResponseSchema,
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
  let applyMappingRequest: unknown;
  let saveMappingRequest: unknown;
  let listMappingRequest: unknown;
  let validationRequest: unknown;
  let editRowRequest: unknown;
  let excludeRowRequest: unknown;
  let commitRequest: unknown;
  let recordFxRequest: unknown;
  let getFxRequest: unknown;
  let convertFxRequest: unknown;
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
    async applyMapping(request: unknown) {
      applyMappingRequest = request;
      return create(ApplyMappingResponseSchema, {
        batchId: "batch-1",
        operationId: "mapping-operation-1",
        status: ImportOperationStatus.QUEUED,
      });
    },
    async saveMappingTemplate(request: {
      id?: string;
      name: string;
      sourceSystem?: string;
      mappingsJson: string;
      transformationRulesJson: string;
    }) {
      saveMappingRequest = request;
      return create(SaveMappingTemplateResponseSchema, {
        template: {
          id: request.id ?? "template-1",
          orgId: "org-test",
          name: request.name,
          sourceSystem: request.sourceSystem,
          mappingsJson: request.mappingsJson,
          transformationRulesJson: request.transformationRulesJson,
          createdBy: "user-test",
        },
      });
    },
    async listMappingTemplates(request: unknown) {
      listMappingRequest = request;
      return create(ListMappingTemplatesResponseSchema, {
        templates: [
          {
            id: "template-1",
            orgId: "org-test",
            name: "ERP",
            sourceSystem: "erp",
            mappingsJson: '{"SKU":"sku.sku_code"}',
            transformationRulesJson: "[]",
            createdBy: "user-test",
          },
        ],
        pagination: { totalCount: 1 },
      });
    },
    async getValidationReport(request: unknown) {
      validationRequest = request;
      return create(GetValidationReportResponseSchema, {
        batchId: "batch-1",
        rowCounts: { ok: 2, warned: 1, excluded: 0, errored: 1 },
        events: [
          {
            id: "event-1",
            batchId: "batch-1",
            orgId: "org-test",
            code: "invalid_price",
            message: "Row 2: price is invalid.",
          },
        ],
        pagination: { totalCount: 1 },
      });
    },
    async editRow(request: { batchId: string; rowId: string; mappedDataJson: string }) {
      editRowRequest = request;
      return create(EditRowResponseSchema, {
        row: {
          id: request.rowId,
          batchId: request.batchId,
          orgId: "org-test",
          rowNumber: 2,
          rawDataJson: '{"Price":"bad"}',
          mappedDataJson: request.mappedDataJson,
        },
        operation: { id: "validation-2", batchId: request.batchId, orgId: "org-test" },
      });
    },
    async excludeRow(request: { batchId: string; rowId: string; reason: string }) {
      excludeRowRequest = request;
      return create(ExcludeRowResponseSchema, {
        row: {
          id: request.rowId,
          batchId: request.batchId,
          orgId: "org-test",
          rowNumber: 2,
          rawDataJson: '{"Price":"bad"}',
          mappedDataJson: '{"price_record":{"price_minor":"bad"}}',
          excludedReason: request.reason,
        },
        operation: { id: "validation-3", batchId: request.batchId, orgId: "org-test" },
      });
    },
    async commitBatch(request: { batchId: string; confirmWarnings: boolean }) {
      commitRequest = request;
      return create(CommitBatchResponseSchema, {
        batchId: request.batchId,
        operation: {
          id: "commit-1",
          orgId: "org-test",
          batchId: request.batchId,
          status: ImportOperationStatus.QUEUED,
        },
      });
    },
    async recordFxRateSnapshot(request: Record<string, unknown>) {
      recordFxRequest = request;
      return create(RecordFxRateSnapshotResponseSchema, {
        snapshot: {
          id: "snapshot-1",
          orgId: "org-test",
          source: String(request["source"]),
          baseCurrency: String(request["baseCurrency"]),
          effectiveAt: request["effectiveAt"] as never,
          recordedAt: timestampFromDate(new Date("2026-08-02T12:00:00Z")),
          rates: request["rates"] as never,
          checksumSha256: "a".repeat(64),
          createdBy: "user-test",
        },
      });
    },
    async getFxRate(request: Record<string, unknown>) {
      getFxRequest = request;
      return create(GetFxRateResponseSchema, {
        quote: {
          sourceCurrency: String(request["sourceCurrency"]),
          targetCurrency: String(request["targetCurrency"]),
          rate: "1500",
          rateSource: String(request["rateSource"]),
          snapshotId: "snapshot-1",
          effectiveAt: request["effectiveAt"] as never,
          recordedAt: timestampFromDate(new Date("2026-08-02T12:00:00Z")),
        },
      });
    },
    async convertCurrency(request: Record<string, unknown>) {
      convertFxRequest = request;
      return create(ConvertCurrencyResponseSchema, {
        sourceAmountMinor: request["amountMinor"] as bigint,
        targetAmountMinor: 1_575_000n,
        sourceMinorUnit: 2,
        targetMinorUnit: 2,
        exactTargetAmount: "15750",
        quote: {
          sourceCurrency: String(request["sourceCurrency"]),
          targetCurrency: String(request["targetCurrency"]),
          rate: "1500",
          rateSource: String(request["rateSource"]),
          snapshotId: "snapshot-1",
          effectiveAt: request["effectiveAt"] as never,
          recordedAt: timestampFromDate(new Date("2026-08-02T12:00:00Z")),
        },
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
    applyMappingRequest: () => applyMappingRequest,
    saveMappingRequest: () => saveMappingRequest,
    listMappingRequest: () => listMappingRequest,
    validationRequest: () => validationRequest,
    editRowRequest: () => editRowRequest,
    excludeRowRequest: () => excludeRowRequest,
    commitRequest: () => commitRequest,
    recordFxRequest: () => recordFxRequest,
    getFxRequest: () => getFxRequest,
    convertFxRequest: () => convertFxRequest,
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

  it("queues native JSON mappings for asynchronous application", async () => {
    const { app, applyMappingRequest } = await testApp();

    const response = await app.inject({
      method: "PUT",
      url: "/imports/batch-1/mapping",
      payload: {
        mappings: { SKU: "sku.sku_code" },
        transformationRules: [],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      batchId: "batch-1",
      operationId: "mapping-operation-1",
      status: "queued",
    });
    expect(applyMappingRequest()).toMatchObject({
      batchId: "batch-1",
      mappingsJson: '{"SKU":"sku.sku_code"}',
      transformationRulesJson: "[]",
    });
    await app.close();
  });

  it("rejects ambiguous mapping sources before calling the service", async () => {
    const { app, applyMappingRequest } = await testApp();

    const response = await app.inject({
      method: "PUT",
      url: "/imports/batch-1/mapping",
      payload: {
        templateId: "template-1",
        mappings: { SKU: "sku.sku_code" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(applyMappingRequest()).toBeUndefined();
    await app.close();
  });

  it("saves and lists templates with native JSON configuration", async () => {
    const { app, saveMappingRequest, listMappingRequest } = await testApp();

    const created = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "ERP",
        sourceSystem: "erp",
        mappings: { SKU: "sku.sku_code" },
        transformationRules: [],
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      template: {
        id: "template-1",
        mappings: { SKU: "sku.sku_code" },
        transformationRules: [],
      },
    });
    expect(saveMappingRequest()).toMatchObject({
      mappingsJson: '{"SKU":"sku.sku_code"}',
      transformationRulesJson: "[]",
    });

    const listed = await app.inject({
      method: "GET",
      url: "/mappings?sourceSystem=erp&pageSize=25",
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      templates: [{ mappings: { SKU: "sku.sku_code" }, transformationRules: [] }],
      pagination: { totalCount: 1 },
    });
    expect(listMappingRequest()).toMatchObject({
      sourceSystem: "erp",
      pagination: { pageSize: 25 },
    });
    await app.close();
  });

  it("returns paginated validation findings and native row JSON for edits", async () => {
    const { app, validationRequest, editRowRequest } = await testApp();

    const report = await app.inject({
      method: "GET",
      url: "/imports/batch-1/validation?pageSize=25&pageToken=next",
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({
      rowCounts: { ok: 2, warned: 1, errored: 1 },
      events: [{ code: "invalid_price" }],
    });
    expect(validationRequest()).toMatchObject({
      batchId: "batch-1",
      pagination: { pageSize: 25, pageToken: "next" },
    });

    const edited = await app.inject({
      method: "PATCH",
      url: "/imports/batch-1/rows/row-1",
      payload: { mappedData: { price_record: { price_minor: 1250 } } },
    });
    expect(edited.statusCode).toBe(202);
    expect(edited.json()).toMatchObject({
      row: {
        rawData: { Price: "bad" },
        mappedData: { price_record: { price_minor: 1250 } },
      },
      operation: { id: "validation-2" },
    });
    expect(editRowRequest()).toMatchObject({
      batchId: "batch-1",
      rowId: "row-1",
      mappedDataJson: '{"price_record":{"price_minor":1250}}',
    });
    await app.close();
  });

  it("requires an exclusion reason and queues revalidation", async () => {
    const { app, excludeRowRequest } = await testApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/imports/batch-1/rows/row-1/exclude",
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    const excluded = await app.inject({
      method: "POST",
      url: "/imports/batch-1/rows/row-1/exclude",
      payload: { reason: "not in scope" },
    });
    expect(excluded.statusCode).toBe(202);
    expect(excluded.json()).toMatchObject({
      row: { excludedReason: "not in scope" },
      operation: { id: "validation-3" },
    });
    expect(excludeRowRequest()).toMatchObject({ reason: "not in scope" });
    await app.close();
  });

  it("queues an asynchronous commit with explicit warning confirmation", async () => {
    const { app, commitRequest } = await testApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/imports/batch-1/commit",
      payload: { confirmWarnings: "yes" },
    });
    expect(invalid.statusCode).toBe(400);

    const queued = await app.inject({
      method: "POST",
      url: "/imports/batch-1/commit",
      payload: { confirmWarnings: true },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json()).toMatchObject({
      batchId: "batch-1",
      operation: { id: "commit-1", status: "IMPORT_OPERATION_STATUS_QUEUED" },
    });
    expect(commitRequest()).toEqual({ batchId: "batch-1", confirmWarnings: true });
    await app.close();
  });

  it("records, resolves, and converts historical FX rates", async () => {
    const { app, recordFxRequest, getFxRequest, convertFxRequest } = await testApp();
    const created = await app.inject({
      method: "POST",
      url: "/intelligence/fx/rate-snapshots",
      payload: {
        idempotencyKey: "close-1",
        source: "treasury",
        baseCurrency: "USD",
        effectiveAt: "2026-08-01T16:00:00Z",
        rates: [{ currency: "NGN", rate: "1500" }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      snapshot: { id: "snapshot-1", orgId: "org-test", rates: [{ rate: "1500" }] },
      replayed: false,
    });
    expect(recordFxRequest()).toMatchObject({ idempotencyKey: "close-1" });

    const rate = await app.inject({
      method: "GET",
      url: "/intelligence/fx/rates?sourceCurrency=USD&targetCurrency=NGN&rateSource=treasury&effectiveAt=2026-08-01T16%3A00%3A00Z&recordedAsOf=2026-08-02T12%3A00%3A00.508123Z",
    });
    expect(rate.statusCode).toBe(200);
    expect(rate.json()).toMatchObject({ quote: { rate: "1500", snapshotId: "snapshot-1" } });
    expect(getFxRequest()).toMatchObject({ sourceCurrency: "USD", targetCurrency: "NGN" });
    expect((getFxRequest() as { recordedAsOf: { nanos: number } }).recordedAsOf.nanos).toBe(
      508_123_000
    );

    const converted = await app.inject({
      method: "POST",
      url: "/intelligence/fx/convert",
      payload: {
        amountMinor: "1050",
        sourceCurrency: "USD",
        targetCurrency: "NGN",
        rateSource: "treasury",
        effectiveAt: "2026-08-01T16:00:00Z",
      },
    });
    expect(converted.statusCode).toBe(200);
    expect(converted.json()).toMatchObject({
      sourceAmountMinor: "1050",
      targetAmountMinor: "1575000",
      quote: { snapshotId: "snapshot-1" },
    });
    expect(convertFxRequest()).toMatchObject({ amountMinor: 1050n });
    await app.close();
  });

  it("rejects unsafe FX amounts and timezone-free timestamps at the gateway", async () => {
    const { app, convertFxRequest } = await testApp();
    const response = await app.inject({
      method: "POST",
      url: "/intelligence/fx/convert",
      payload: {
        amountMinor: 9007199254740992,
        sourceCurrency: "USD",
        targetCurrency: "NGN",
        rateSource: "treasury",
        effectiveAt: "2026-08-01T16:00:00",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(convertFxRequest()).toBeUndefined();

    const invalidCalendarDate = await app.inject({
      method: "GET",
      url: "/intelligence/fx/rates?sourceCurrency=USD&targetCurrency=NGN&rateSource=treasury&effectiveAt=2026-02-30T00%3A00%3A00Z",
    });
    expect(invalidCalendarDate.statusCode).toBe(400);

    const invalidHour = await app.inject({
      method: "GET",
      url: "/intelligence/fx/rates?sourceCurrency=USD&targetCurrency=NGN&rateSource=treasury&effectiveAt=2026-08-01T24%3A00%3A00Z",
    });
    expect(invalidHour.statusCode).toBe(400);
    await app.close();
  });
});
