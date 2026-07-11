import { create, fromJson, toBinary, toJson, type JsonValue } from "@bufbuild/protobuf";
import { createHash } from "node:crypto";
import { Code, ConnectError } from "@connectrpc/connect";
import type { DatabaseError, PoolClient } from "pg";
import { v7 as uuidv7 } from "uuid";
import {
  ApplyPriceChangesResponseSchema,
  CatalogErrorCode,
  CatalogWriteErrorSchema,
  CanonicalRowResultSchema,
  SourceType,
  ApplyPriceChangesRequestSchema,
  UpsertCanonicalResponseSchema,
  UpsertCanonicalRequestSchema,
  WriteStatus,
  WriteSummarySchema,
  type ApplyPriceChangesRequest,
  type ApplyPriceChangesResponse,
  type CanonicalRowResult,
  type CanonicalWriteRow,
  type NewSku,
  type NewSkuIdentifier,
  type PriceChange,
  type SourceContext,
  type UpsertCanonicalRequest,
  type UpsertCanonicalResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import {
  CostUpdatedSchema,
  PriceUpdatedSchema,
  SkuAddedSchema,
} from "@owomide/proto/events/catalog/v1_pb.js";
import { Database } from "./db.js";
import {
  normalizeCurrency,
  normalizeKey,
  normalizeNamespace,
  parseAttributes,
} from "./domain/normalize.js";
import {
  dateToTimestamp,
  optionalTimestampToDate,
  timestampToDate,
  validatePeriod,
} from "./domain/time.js";
import { RowWriteError } from "./domain/write-error.js";
import { ReadRepository } from "./repo/read-repository.js";
import type { SkuRow } from "./repo/mappers.js";

const MAX_ROWS = 500;
const SAVEPOINT = "catalog_source_row";

interface OperationRow {
  id: string;
  payload_sha256: string;
  status: string;
  response_json: JsonValue | null;
}

interface EconomicRow {
  id: string;
  amount_minor: string;
  currency: string;
  effective_at: Date;
  effective_until: Date | null;
  recorded_at: Date;
  source_type: string;
  source_ref: string;
  source_item_ref: string;
  actor_id: string | null;
  [key: string]: unknown;
}

interface SourceValues {
  sourceType: string;
  sourceRef: string;
  sourceItemRef: string;
  actorId: string | null;
}

interface TemporalResult {
  id: string;
  status: WriteStatus;
}

interface SkuResolution {
  row: SkuRow;
  status: WriteStatus;
}

function hashRequest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceTypeName(sourceType: SourceType): string {
  switch (sourceType) {
    case SourceType.IMPORT:
      return "import";
    case SourceType.PROPOSAL:
      return "proposal";
    case SourceType.MANUAL:
      return "manual";
    case SourceType.SYSTEM:
      return "system";
    case SourceType.MIGRATION:
      return "migration";
    default:
      throw new ConnectError("source.source_type is required", Code.InvalidArgument);
  }
}

function validateIdempotencyKey(value: string): void {
  if (!value || value.length > 200) {
    throw new ConnectError(
      "idempotency_key must contain 1 to 200 characters",
      Code.InvalidArgument
    );
  }
}

function validateRows(rows: readonly unknown[]): void {
  if (rows.length === 0)
    throw new ConnectError("At least one row is required", Code.InvalidArgument);
  if (rows.length > MAX_ROWS)
    throw new ConnectError(`At most ${MAX_ROWS} rows are allowed`, Code.InvalidArgument);
}

function writeError(error: RowWriteError) {
  return create(CatalogWriteErrorSchema, {
    code: error.code,
    message: error.message,
    field: error.field,
  });
}

function rejectedResult(sourceItemRef: string, error: RowWriteError): CanonicalRowResult {
  return create(CanonicalRowResultSchema, {
    sourceItemRef,
    status: WriteStatus.REJECTED,
    errors: [writeError(error)],
  });
}

function summarize(results: readonly CanonicalRowResult[]) {
  const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (const result of results) {
    if (result.status === WriteStatus.CREATED) counts.created += 1;
    else if (result.status === WriteStatus.UPDATED) counts.updated += 1;
    else if (result.status === WriteStatus.UNCHANGED) counts.unchanged += 1;
    else if (result.status === WriteStatus.REJECTED) counts.rejected += 1;
  }
  return create(WriteSummarySchema, counts);
}

function isPgError(error: unknown): error is DatabaseError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function mapExpectedError(error: unknown): RowWriteError | undefined {
  if (error instanceof RowWriteError) return error;
  if (error instanceof ConnectError && error.code === Code.InvalidArgument) {
    return new RowWriteError(CatalogErrorCode.INVALID_ARGUMENT, error.rawMessage);
  }
  if (!isPgError(error)) return undefined;
  switch (error.code) {
    case "23P01":
      return new RowWriteError(
        CatalogErrorCode.OVERLAPPING_PERIOD,
        "The effective period conflicts with an existing record"
      );
    case "23503":
      return new RowWriteError(
        CatalogErrorCode.INVALID_ARGUMENT,
        "A referenced Catalog entity does not exist"
      );
    case "23505":
      return new RowWriteError(
        CatalogErrorCode.IDENTIFIER_CONFLICT,
        "A canonical identity is already assigned to another record"
      );
    case "23514":
      return new RowWriteError(
        CatalogErrorCode.INVALID_ARGUMENT,
        "A canonical value violates a Catalog constraint"
      );
    default:
      return undefined;
  }
}

function maxStatus(statuses: readonly WriteStatus[]): WriteStatus {
  if (statuses.includes(WriteStatus.CREATED)) return WriteStatus.CREATED;
  if (statuses.includes(WriteStatus.UPDATED)) return WriteStatus.UPDATED;
  return WriteStatus.UNCHANGED;
}

function containsPeriod(existing: EconomicRow, start: Date, end: Date | null): boolean {
  if (existing.effective_at.getTime() > start.getTime()) return false;
  if (end === null) return existing.effective_until === null;
  return existing.effective_until === null || existing.effective_until.getTime() >= end.getTime();
}

export class CatalogWriteEngine {
  constructor(
    private readonly database: Database,
    private readonly reads: ReadRepository
  ) {}

  async upsertCanonical(
    orgId: string,
    callerService: string,
    request: UpsertCanonicalRequest
  ): Promise<UpsertCanonicalResponse> {
    validateIdempotencyKey(request.idempotencyKey);
    validateRows(request.rows);
    if (!request.source?.sourceRef.trim()) {
      throw new ConnectError("source.source_ref is required", Code.InvalidArgument);
    }
    if (request.source.sourceType !== SourceType.IMPORT) {
      throw new ConnectError("UpsertCanonical requires import provenance", Code.InvalidArgument);
    }
    const sourceType = sourceTypeName(request.source.sourceType);
    const payloadHash = hashRequest(toBinary(UpsertCanonicalRequestSchema, request));
    return this.database.withOrgTransaction(orgId, async (client) => {
      const operation = await this.beginOperation(
        client,
        orgId,
        callerService,
        "upsert_canonical",
        request.idempotencyKey,
        payloadHash
      );
      if (operation.response_json) {
        const replay = fromJson(
          UpsertCanonicalResponseSchema,
          operation.response_json
        ) as UpsertCanonicalResponse;
        replay.replayed = true;
        return replay;
      }
      const results: CanonicalRowResult[] = [];
      for (const row of request.rows) {
        results.push(
          await this.withRowSavepoint(client, row.sourceItemRef, () =>
            this.processCanonicalRow(client, orgId, operation.id, request.source!, sourceType, row)
          )
        );
      }
      const response = create(UpsertCanonicalResponseSchema, {
        operationId: operation.id,
        replayed: false,
        results,
        summary: summarize(results),
      });
      await this.completeOperation(
        client,
        operation.id,
        toJson(UpsertCanonicalResponseSchema, response)
      );
      return response;
    });
  }

  async applyPriceChanges(
    orgId: string,
    callerService: string,
    request: ApplyPriceChangesRequest
  ): Promise<ApplyPriceChangesResponse> {
    validateIdempotencyKey(request.idempotencyKey);
    validateRows(request.changes);
    if (!request.proposalId.trim())
      throw new ConnectError("proposal_id is required", Code.InvalidArgument);
    const payloadHash = hashRequest(toBinary(ApplyPriceChangesRequestSchema, request));
    return this.database.withOrgTransaction(orgId, async (client) => {
      const operation = await this.beginOperation(
        client,
        orgId,
        callerService,
        "apply_price_changes",
        request.idempotencyKey,
        payloadHash
      );
      if (operation.response_json) {
        const replay = fromJson(
          ApplyPriceChangesResponseSchema,
          operation.response_json
        ) as ApplyPriceChangesResponse;
        replay.replayed = true;
        return replay;
      }
      const results: CanonicalRowResult[] = [];
      for (const change of request.changes) {
        results.push(
          await this.withRowSavepoint(client, change.proposalLineId, () =>
            this.processPriceChange(client, orgId, operation.id, request, change)
          )
        );
      }
      const response = create(ApplyPriceChangesResponseSchema, {
        operationId: operation.id,
        replayed: false,
        results,
        summary: summarize(results),
      });
      await this.completeOperation(
        client,
        operation.id,
        toJson(ApplyPriceChangesResponseSchema, response)
      );
      return response;
    });
  }

  private async beginOperation(
    client: PoolClient,
    orgId: string,
    callerService: string,
    operationType: string,
    idempotencyKey: string,
    payloadHash: string
  ): Promise<OperationRow> {
    const inserted = await client.query<OperationRow>(
      `INSERT INTO catalog.write_operation (
         org_id, caller_service, operation_type, idempotency_key, payload_sha256, status
       ) VALUES ($1, $2, $3, $4, $5, 'in_progress')
       ON CONFLICT (org_id, caller_service, idempotency_key) DO NOTHING
       RETURNING id, payload_sha256, status, response_json`,
      [orgId, callerService, operationType, idempotencyKey, payloadHash]
    );
    if (inserted.rows[0]) return inserted.rows[0];
    const existing = await client.query<OperationRow>(
      `SELECT id, payload_sha256, status, response_json
       FROM catalog.write_operation
       WHERE org_id = $1 AND caller_service = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [orgId, callerService, idempotencyKey]
    );
    const operation = existing.rows[0];
    if (
      !operation ||
      operation.payload_sha256 !== payloadHash ||
      operation.status !== "succeeded" ||
      !operation.response_json
    ) {
      throw new ConnectError(
        "Idempotency key was already used with a different request",
        Code.AlreadyExists
      );
    }
    return operation;
  }

  private async completeOperation(
    client: PoolClient,
    id: string,
    response: JsonValue
  ): Promise<void> {
    await client.query(
      `UPDATE catalog.write_operation
       SET status = 'succeeded', response_json = $2::jsonb, completed_at = clock_timestamp()
       WHERE id = $1`,
      [id, JSON.stringify(response)]
    );
  }

  private async withRowSavepoint(
    client: PoolClient,
    sourceItemRef: string,
    work: () => Promise<CanonicalRowResult>
  ): Promise<CanonicalRowResult> {
    const ref = sourceItemRef.trim();
    if (!ref)
      return rejectedResult(
        "",
        new RowWriteError(
          CatalogErrorCode.INVALID_ARGUMENT,
          "source_item_ref is required",
          "source_item_ref"
        )
      );
    await client.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const result = await work();
      await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      const expected = mapExpectedError(error);
      if (expected) return rejectedResult(ref, expected);
      throw error;
    }
  }

  private async processCanonicalRow(
    client: PoolClient,
    orgId: string,
    operationId: string,
    source: SourceContext,
    sourceType: string,
    row: CanonicalWriteRow
  ): Promise<CanonicalRowResult> {
    const now = new Date();
    const sku = await this.resolveOrCreateSku(client, orgId, source, row, now);
    const statuses: WriteStatus[] = [sku.status];
    const costRecordIds: string[] = [];
    const priceRecordIds: string[] = [];
    const sourceValues: SourceValues = {
      sourceType,
      sourceRef: source.sourceRef,
      sourceItemRef: row.sourceItemRef,
      actorId: source.actorId ?? null,
    };
    if (row.cost) {
      const money = row.cost.cost;
      if (!money || money.amount < 0n) {
        throw new RowWriteError(
          CatalogErrorCode.INVALID_ARGUMENT,
          "cost.amount must be non-negative",
          "cost.amount"
        );
      }
      const amount = money.amount;
      const start = timestampToDate(row.cost.effectiveAt, "cost.effective_at");
      const end = optionalTimestampToDate(row.cost.effectiveUntil, "cost.effective_until");
      validatePeriod(start, end);
      await this.assertOptionalReference(
        client,
        "location",
        row.cost.locationId,
        CatalogErrorCode.UNKNOWN_LOCATION
      );
      const result = await this.writeCost(client, {
        orgId,
        operationId,
        skuId: sku.row.id,
        locationId: row.cost.locationId ?? null,
        costType: (row.cost.costType || "standard").trim().toLowerCase(),
        amountMinor: amount,
        currency: normalizeCurrency(money.currency),
        start,
        end,
        now,
        source: sourceValues,
      });
      statuses.push(result.status);
      costRecordIds.push(result.id);
    }
    for (const price of row.prices) {
      const money = price.price;
      if (!money || money.amount < 0n) {
        throw new RowWriteError(
          CatalogErrorCode.INVALID_ARGUMENT,
          "price.amount must be non-negative",
          "price.amount"
        );
      }
      const amount = money.amount;
      const start = timestampToDate(price.effectiveAt, "price.effective_at");
      const end = optionalTimestampToDate(price.effectiveUntil, "price.effective_until");
      validatePeriod(start, end);
      await this.assertReference(
        client,
        "channel",
        price.channelId,
        CatalogErrorCode.UNKNOWN_CHANNEL
      );
      await this.assertOptionalReference(
        client,
        "location",
        price.locationId,
        CatalogErrorCode.UNKNOWN_LOCATION
      );
      await this.assertOptionalReference(
        client,
        "customer_segment",
        price.customerSegmentId,
        CatalogErrorCode.UNKNOWN_SEGMENT
      );
      const result = await this.writePrice(client, {
        orgId,
        operationId,
        skuId: sku.row.id,
        channelId: price.channelId,
        locationId: price.locationId ?? null,
        customerSegmentId: price.customerSegmentId ?? null,
        amountMinor: amount,
        currency: normalizeCurrency(money.currency),
        start,
        end,
        now,
        source: sourceValues,
      });
      statuses.push(result.status);
      priceRecordIds.push(result.id);
    }
    return create(CanonicalRowResultSchema, {
      sourceItemRef: row.sourceItemRef,
      status: maxStatus(statuses),
      skuId: sku.row.id,
      costRecordIds,
      priceRecordIds,
    });
  }

  private async processPriceChange(
    client: PoolClient,
    orgId: string,
    operationId: string,
    request: ApplyPriceChangesRequest,
    change: PriceChange
  ): Promise<CanonicalRowResult> {
    if (!change.proposalLineId.trim()) {
      throw new RowWriteError(
        CatalogErrorCode.INVALID_ARGUMENT,
        "proposal_line_id is required",
        "proposal_line_id"
      );
    }
    const skuResult = await client.query<SkuRow>(
      "SELECT * FROM catalog.sku WHERE id = $1 AND archived_at IS NULL",
      [change.skuId]
    );
    const sku = skuResult.rows[0];
    if (!sku)
      throw new RowWriteError(CatalogErrorCode.IDENTITY_NOT_FOUND, "SKU not found", "sku_id");
    await this.assertReference(
      client,
      "channel",
      change.channelId,
      CatalogErrorCode.UNKNOWN_CHANNEL
    );
    await this.assertOptionalReference(
      client,
      "location",
      change.locationId,
      CatalogErrorCode.UNKNOWN_LOCATION
    );
    await this.assertOptionalReference(
      client,
      "customer_segment",
      change.customerSegmentId,
      CatalogErrorCode.UNKNOWN_SEGMENT
    );
    const money = change.newPrice;
    if (!money || money.amount < 0n) {
      throw new RowWriteError(
        CatalogErrorCode.INVALID_ARGUMENT,
        "new_price.amount must be non-negative",
        "new_price.amount"
      );
    }
    const amount = money.amount;
    const start = timestampToDate(change.effectiveAt, "effective_at");
    const end = optionalTimestampToDate(change.effectiveUntil, "effective_until");
    validatePeriod(start, end);
    const result = await this.writePrice(client, {
      orgId,
      operationId,
      skuId: sku.id,
      channelId: change.channelId,
      locationId: change.locationId ?? null,
      customerSegmentId: change.customerSegmentId ?? null,
      amountMinor: amount,
      currency: normalizeCurrency(money.currency),
      start,
      end,
      now: new Date(),
      source: {
        sourceType: "proposal",
        sourceRef: request.proposalId,
        sourceItemRef: change.proposalLineId,
        actorId: request.actorId ?? null,
      },
    });
    return create(CanonicalRowResultSchema, {
      sourceItemRef: change.proposalLineId,
      status: result.status,
      skuId: sku.id,
      priceRecordIds: [result.id],
    });
  }

  private async resolveOrCreateSku(
    client: PoolClient,
    orgId: string,
    source: SourceContext,
    row: CanonicalWriteRow,
    now: Date
  ): Promise<SkuResolution> {
    let existing: SkuRow | undefined;
    try {
      existing = await this.reads.resolveSkuRow(client, row.skuIdentity);
    } catch (error) {
      if (!(error instanceof ConnectError) || error.code !== Code.NotFound) throw error;
    }
    if (!existing) {
      if (!row.newSku || row.skuIdentity?.key.case === "skuId") {
        throw new RowWriteError(
          CatalogErrorCode.IDENTITY_NOT_FOUND,
          "SKU identity was not found",
          "sku_identity"
        );
      }
      this.assertNewSkuMatchesIdentity(row);
      const created = await this.createSku(client, orgId, row.newSku);
      await this.insertSkuEvent(client, orgId, created, source, row.sourceItemRef, now);
      return { row: created, status: WriteStatus.CREATED };
    }
    if (!row.newSku) return { row: existing, status: WriteStatus.UNCHANGED };
    const updated = await this.enrichExistingSku(client, existing, row.newSku);
    return {
      row: updated.row,
      status: updated.changed ? WriteStatus.UPDATED : WriteStatus.UNCHANGED,
    };
  }

  private assertNewSkuMatchesIdentity(row: CanonicalWriteRow): void {
    const key = row.skuIdentity?.key;
    const input = row.newSku!;
    if (key?.case === "skuCode") {
      if (
        normalizeKey(key.value, "sku_identity.sku_code") !==
        normalizeKey(input.skuCode, "new_sku.sku_code")
      ) {
        throw new RowWriteError(
          CatalogErrorCode.SKU_ATTRIBUTE_CONFLICT,
          "new_sku.sku_code must match sku_identity.sku_code",
          "new_sku.sku_code"
        );
      }
      return;
    }
    if (key?.case === "identifier") {
      const expectedType = normalizeKey(
        key.value.type,
        "sku_identity.identifier.type"
      ).toLowerCase();
      const expectedNamespace = normalizeNamespace(key.value.namespace);
      const expectedValue = normalizeKey(key.value.value, "sku_identity.identifier.value");
      const included = input.identifiers.some(
        (identifier: NewSkuIdentifier) =>
          normalizeKey(identifier.type, "new_sku.identifier.type").toLowerCase() === expectedType &&
          normalizeNamespace(identifier.namespace) === expectedNamespace &&
          normalizeKey(identifier.value, "new_sku.identifier.value") === expectedValue
      );
      if (!included) {
        throw new RowWriteError(
          CatalogErrorCode.SKU_CREATE_REQUIRES_CODE,
          "new_sku.identifiers must include the identifier used for creation",
          "new_sku.identifiers"
        );
      }
      return;
    }
    throw new RowWriteError(
      CatalogErrorCode.INVALID_ARGUMENT,
      "sku_identity is required",
      "sku_identity"
    );
  }

  private async createSku(client: PoolClient, orgId: string, input: NewSku): Promise<SkuRow> {
    const codeNormalized = normalizeKey(input.skuCode, "new_sku.sku_code");
    if (input.productId)
      await this.assertReference(
        client,
        "product",
        input.productId,
        CatalogErrorCode.UNKNOWN_PRODUCT
      );
    const result = await client.query<SkuRow>(
      `INSERT INTO catalog.sku (
         org_id, product_id, sku_code, sku_code_normalized, pack_size, unit, attributes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        orgId,
        input.productId ?? null,
        input.skuCode.trim(),
        codeNormalized,
        input.packSize ?? null,
        input.unit?.trim() || null,
        parseAttributes(input.attributesJson),
      ]
    );
    const sku = result.rows[0]!;
    await this.addIdentifiers(client, orgId, sku.id, input.identifiers);
    return sku;
  }

  private async enrichExistingSku(
    client: PoolClient,
    existing: SkuRow,
    input: NewSku
  ): Promise<{ row: SkuRow; changed: boolean }> {
    if (normalizeKey(input.skuCode, "new_sku.sku_code") !== existing.sku_code_normalized) {
      throw new RowWriteError(
        CatalogErrorCode.SKU_ATTRIBUTE_CONFLICT,
        "new_sku.sku_code conflicts with the matched SKU",
        "new_sku.sku_code"
      );
    }
    if (input.productId && existing.product_id && input.productId !== existing.product_id) {
      throw new RowWriteError(
        CatalogErrorCode.SKU_ATTRIBUTE_CONFLICT,
        "new_sku.product_id conflicts with the matched SKU",
        "new_sku.product_id"
      );
    }
    if (
      input.packSize !== undefined &&
      existing.pack_size !== null &&
      input.packSize !== existing.pack_size
    ) {
      throw new RowWriteError(
        CatalogErrorCode.SKU_ATTRIBUTE_CONFLICT,
        "new_sku.pack_size conflicts with the matched SKU",
        "new_sku.pack_size"
      );
    }
    if (
      input.unit !== undefined &&
      existing.unit !== null &&
      normalizeKey(input.unit, "new_sku.unit") !== normalizeKey(existing.unit, "sku.unit")
    ) {
      throw new RowWriteError(
        CatalogErrorCode.SKU_ATTRIBUTE_CONFLICT,
        "new_sku.unit conflicts with the matched SKU",
        "new_sku.unit"
      );
    }
    if (input.productId && !existing.product_id) {
      await this.assertReference(
        client,
        "product",
        input.productId,
        CatalogErrorCode.UNKNOWN_PRODUCT
      );
    }
    const fillsProduct = Boolean(input.productId && !existing.product_id);
    const fillsPackSize = input.packSize !== undefined && existing.pack_size === null;
    const fillsUnit = input.unit !== undefined && existing.unit === null;
    let row = existing;
    if (fillsProduct || fillsPackSize || fillsUnit) {
      const result = await client.query<SkuRow>(
        `UPDATE catalog.sku
         SET product_id = COALESCE(product_id, $2::uuid),
             pack_size = COALESCE(pack_size, $3::integer),
             unit = COALESCE(unit, $4::text)
         WHERE id = $1
         RETURNING *`,
        [existing.id, input.productId ?? null, input.packSize ?? null, input.unit?.trim() || null]
      );
      row = result.rows[0]!;
    }
    const added = await this.addIdentifiers(
      client,
      existing.org_id,
      existing.id,
      input.identifiers
    );
    const changed = added || fillsProduct || fillsPackSize || fillsUnit;
    return { row, changed };
  }

  private async addIdentifiers(
    client: PoolClient,
    orgId: string,
    skuId: string,
    identifiers: readonly NewSkuIdentifier[]
  ): Promise<boolean> {
    let changed = false;
    for (const identifier of identifiers) {
      const type = normalizeKey(identifier.type, "identifier.type").toLowerCase();
      const namespace = normalizeNamespace(identifier.namespace);
      if (type === "source_system" && !namespace) {
        throw new RowWriteError(
          CatalogErrorCode.INVALID_ARGUMENT,
          "source_system identifiers require a namespace",
          "identifier.namespace"
        );
      }
      const result = await client.query(
        `INSERT INTO catalog.sku_identifier (
           org_id, sku_id, identifier_type, namespace, raw_value, normalized_value, is_primary
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (org_id, identifier_type, namespace, normalized_value) WHERE archived_at IS NULL
         DO NOTHING
         RETURNING id`,
        [
          orgId,
          skuId,
          type,
          namespace,
          identifier.value.trim(),
          normalizeKey(identifier.value, "identifier.value"),
          identifier.isPrimary,
        ]
      );
      if (result.rowCount === 1) changed = true;
      else {
        const owner = await client.query<{ sku_id: string }>(
          `SELECT sku_id FROM catalog.sku_identifier
           WHERE identifier_type = $1 AND namespace = $2 AND normalized_value = $3 AND archived_at IS NULL`,
          [type, namespace, normalizeKey(identifier.value, "identifier.value")]
        );
        if (owner.rows[0]?.sku_id !== skuId) {
          throw new RowWriteError(
            CatalogErrorCode.IDENTIFIER_CONFLICT,
            "Identifier is assigned to another SKU",
            "new_sku.identifiers"
          );
        }
      }
    }
    return changed;
  }

  private async assertReference(
    client: PoolClient,
    table: "product" | "channel" | "location" | "customer_segment",
    id: string,
    code: CatalogErrorCode
  ): Promise<void> {
    if (!id) throw new RowWriteError(code, `${table} is required`);
    const result = await client.query(
      `SELECT 1 FROM catalog.${table} WHERE id = $1 AND archived_at IS NULL`,
      [id]
    );
    if (result.rowCount !== 1)
      throw new RowWriteError(code, `${table.replace("_", " ")} not found`);
  }

  private async assertOptionalReference(
    client: PoolClient,
    table: "location" | "customer_segment",
    id: string | undefined,
    code: CatalogErrorCode
  ): Promise<void> {
    if (id !== undefined) await this.assertReference(client, table, id, code);
  }

  private async writeCost(
    client: PoolClient,
    input: {
      orgId: string;
      operationId: string;
      skuId: string;
      locationId: string | null;
      costType: string;
      amountMinor: bigint;
      currency: string;
      start: Date;
      end: Date | null;
      now: Date;
      source: SourceValues;
    }
  ): Promise<TemporalResult> {
    if (!input.costType)
      throw new RowWriteError(
        CatalogErrorCode.INVALID_ARGUMENT,
        "cost_type is required",
        "cost.cost_type"
      );
    const lockKey = [
      "cost",
      input.orgId,
      input.skuId,
      input.locationId ?? "*",
      input.costType,
      input.currency,
    ].join("|");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
    const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
    const now = clock.rows[0]!.now;
    const overlaps = await client.query<EconomicRow>(
      `SELECT * FROM catalog.cost_record
       WHERE sku_id = $1 AND location_id IS NOT DISTINCT FROM $2::uuid
         AND cost_type = $3 AND currency = $4 AND superseded_at IS NULL
         AND effective_period && tstzrange($5, $6, '[)')
       ORDER BY effective_at FOR UPDATE`,
      [input.skuId, input.locationId, input.costType, input.currency, input.start, input.end]
    );
    const same = overlaps.rows.find(
      (row) =>
        BigInt(row.amount_minor) === input.amountMinor &&
        containsPeriod(row, input.start, input.end)
    );
    if (same) return { id: same.id, status: WriteStatus.UNCHANGED };
    await this.supersedeAndFragmentCost(
      client,
      overlaps.rows,
      input.operationId,
      now,
      input.start,
      input.end
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO catalog.cost_record (
         org_id, sku_id, location_id, cost_type, amount_minor, currency,
         effective_at, effective_until, recorded_at, source_type, source_ref,
         source_item_ref, actor_id, write_operation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        input.orgId,
        input.skuId,
        input.locationId,
        input.costType,
        input.amountMinor.toString(),
        input.currency,
        input.start,
        input.end,
        now,
        input.source.sourceType,
        input.source.sourceRef,
        input.source.sourceItemRef,
        input.source.actorId,
        input.operationId,
      ]
    );
    const id = inserted.rows[0]!.id;
    await this.insertCostEvent(client, id, { ...input, now });
    return { id, status: overlaps.rows.length > 0 ? WriteStatus.UPDATED : WriteStatus.CREATED };
  }

  private async supersedeAndFragmentCost(
    client: PoolClient,
    rows: readonly EconomicRow[],
    operationId: string,
    now: Date,
    incomingStart: Date,
    incomingEnd: Date | null
  ): Promise<void> {
    for (const row of rows) {
      await client.query(
        "UPDATE catalog.cost_record SET superseded_at = $2, superseded_by_operation_id = $3 WHERE id = $1",
        [row.id, now, operationId]
      );
      for (const [start, end] of this.fragments(row, incomingStart, incomingEnd)) {
        await client.query(
          `INSERT INTO catalog.cost_record (
             org_id, sku_id, location_id, cost_type, amount_minor, currency,
             effective_at, effective_until, recorded_at, source_type, source_ref,
             source_item_ref, actor_id, write_operation_id, derived_from_record_id
           ) SELECT org_id, sku_id, location_id, cost_type, amount_minor, currency,
             $2, $3, $4, source_type, source_ref, source_item_ref, actor_id, $5, id
           FROM catalog.cost_record WHERE id = $1`,
          [row.id, start, end, now, operationId]
        );
      }
    }
  }

  private async writePrice(
    client: PoolClient,
    input: {
      orgId: string;
      operationId: string;
      skuId: string;
      channelId: string;
      locationId: string | null;
      customerSegmentId: string | null;
      amountMinor: bigint;
      currency: string;
      start: Date;
      end: Date | null;
      now: Date;
      source: SourceValues;
    }
  ): Promise<TemporalResult> {
    const lockKey = [
      "price",
      input.orgId,
      input.skuId,
      input.channelId,
      input.locationId ?? "*",
      input.customerSegmentId ?? "*",
      input.currency,
    ].join("|");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
    const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
    const now = clock.rows[0]!.now;
    const overlaps = await client.query<EconomicRow>(
      `SELECT * FROM catalog.price_record
       WHERE sku_id = $1 AND channel_id = $2
         AND location_id IS NOT DISTINCT FROM $3::uuid
         AND customer_segment_id IS NOT DISTINCT FROM $4::uuid
         AND currency = $5 AND superseded_at IS NULL
         AND effective_period && tstzrange($6, $7, '[)')
       ORDER BY effective_at FOR UPDATE`,
      [
        input.skuId,
        input.channelId,
        input.locationId,
        input.customerSegmentId,
        input.currency,
        input.start,
        input.end,
      ]
    );
    const same = overlaps.rows.find(
      (row) =>
        BigInt(row.amount_minor) === input.amountMinor &&
        containsPeriod(row, input.start, input.end)
    );
    if (same) return { id: same.id, status: WriteStatus.UNCHANGED };
    await this.supersedeAndFragmentPrice(
      client,
      overlaps.rows,
      input.operationId,
      now,
      input.start,
      input.end
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO catalog.price_record (
         org_id, sku_id, channel_id, location_id, customer_segment_id, amount_minor,
         currency, effective_at, effective_until, recorded_at, source_type, source_ref,
         source_item_ref, actor_id, write_operation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        input.orgId,
        input.skuId,
        input.channelId,
        input.locationId,
        input.customerSegmentId,
        input.amountMinor.toString(),
        input.currency,
        input.start,
        input.end,
        now,
        input.source.sourceType,
        input.source.sourceRef,
        input.source.sourceItemRef,
        input.source.actorId,
        input.operationId,
      ]
    );
    const id = inserted.rows[0]!.id;
    await this.insertPriceEvent(client, id, { ...input, now });
    return { id, status: overlaps.rows.length > 0 ? WriteStatus.UPDATED : WriteStatus.CREATED };
  }

  private async supersedeAndFragmentPrice(
    client: PoolClient,
    rows: readonly EconomicRow[],
    operationId: string,
    now: Date,
    incomingStart: Date,
    incomingEnd: Date | null
  ): Promise<void> {
    for (const row of rows) {
      await client.query(
        "UPDATE catalog.price_record SET superseded_at = $2, superseded_by_operation_id = $3 WHERE id = $1",
        [row.id, now, operationId]
      );
      for (const [start, end] of this.fragments(row, incomingStart, incomingEnd)) {
        await client.query(
          `INSERT INTO catalog.price_record (
             org_id, sku_id, channel_id, location_id, customer_segment_id, amount_minor,
             currency, effective_at, effective_until, recorded_at, source_type, source_ref,
             source_item_ref, actor_id, write_operation_id, derived_from_record_id
           ) SELECT org_id, sku_id, channel_id, location_id, customer_segment_id, amount_minor,
             currency, $2, $3, $4, source_type, source_ref, source_item_ref, actor_id, $5, id
           FROM catalog.price_record WHERE id = $1`,
          [row.id, start, end, now, operationId]
        );
      }
    }
  }

  private fragments(
    row: EconomicRow,
    incomingStart: Date,
    incomingEnd: Date | null
  ): Array<[Date, Date | null]> {
    const fragments: Array<[Date, Date | null]> = [];
    if (row.effective_at.getTime() < incomingStart.getTime()) {
      fragments.push([row.effective_at, incomingStart]);
    }
    if (
      incomingEnd &&
      (!row.effective_until || row.effective_until.getTime() > incomingEnd.getTime())
    ) {
      fragments.push([incomingEnd, row.effective_until]);
    }
    return fragments;
  }

  private async insertOutbox(
    client: PoolClient,
    eventType: string,
    orgId: string,
    aggregateType: string,
    aggregateId: string,
    partitionKey: string,
    payload: Uint8Array,
    occurredAt: Date,
    sourceRef: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO catalog.outbox_event (
         id, org_id, event_type, aggregate_type, aggregate_id, partition_key,
         payload, metadata, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv7(),
        orgId,
        eventType,
        aggregateType,
        aggregateId,
        partitionKey,
        Buffer.from(payload),
        { correlation_id: sourceRef },
        occurredAt,
      ]
    );
  }

  private async insertSkuEvent(
    client: PoolClient,
    orgId: string,
    sku: SkuRow,
    source: SourceContext,
    sourceItemRef: string,
    at: Date
  ): Promise<void> {
    const event = create(SkuAddedSchema, {
      orgId,
      skuId: sku.id,
      skuCode: sku.sku_code,
      sourceRef: source.sourceRef,
      sourceItemRef,
      actorId: source.actorId,
      at: dateToTimestamp(at),
    });
    await this.insertOutbox(
      client,
      "catalog.sku_added",
      orgId,
      "sku",
      sku.id,
      sku.id,
      toBinary(SkuAddedSchema, event),
      at,
      source.sourceRef
    );
  }

  private async insertCostEvent(
    client: PoolClient,
    id: string,
    input: {
      orgId: string;
      skuId: string;
      locationId: string | null;
      costType: string;
      amountMinor: bigint;
      currency: string;
      start: Date;
      now: Date;
      source: SourceValues;
    }
  ): Promise<void> {
    const event = create(CostUpdatedSchema, {
      orgId: input.orgId,
      costRecordId: id,
      skuId: input.skuId,
      locationId: input.locationId ?? undefined,
      costType: input.costType,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceRef: input.source.sourceRef,
      sourceItemRef: input.source.sourceItemRef,
      actorId: input.source.actorId ?? undefined,
      effectiveAt: dateToTimestamp(input.start),
      at: dateToTimestamp(input.now),
    });
    await this.insertOutbox(
      client,
      "catalog.cost_updated",
      input.orgId,
      "cost_record",
      id,
      input.skuId,
      toBinary(CostUpdatedSchema, event),
      input.now,
      input.source.sourceRef
    );
  }

  private async insertPriceEvent(
    client: PoolClient,
    id: string,
    input: {
      orgId: string;
      skuId: string;
      channelId: string;
      locationId: string | null;
      customerSegmentId: string | null;
      amountMinor: bigint;
      currency: string;
      start: Date;
      now: Date;
      source: SourceValues;
    }
  ): Promise<void> {
    const event = create(PriceUpdatedSchema, {
      orgId: input.orgId,
      priceRecordId: id,
      skuId: input.skuId,
      channelId: input.channelId,
      locationId: input.locationId ?? undefined,
      customerSegmentId: input.customerSegmentId ?? undefined,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceRef: input.source.sourceRef,
      sourceItemRef: input.source.sourceItemRef,
      actorId: input.source.actorId ?? undefined,
      effectiveAt: dateToTimestamp(input.start),
      at: dateToTimestamp(input.now),
    });
    await this.insertOutbox(
      client,
      "catalog.price_updated",
      input.orgId,
      "price_record",
      id,
      input.skuId,
      toBinary(PriceUpdatedSchema, event),
      input.now,
      input.source.sourceRef
    );
  }
}
