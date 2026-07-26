import { Code, ConnectError } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { z } from "zod";
import type pg from "pg";
import type pino from "pino";
import {
  type RestoreRequest,
  type RestoreResponse,
  RestoreResponseSchema,
} from "@owomide/proto/services/governance/v1/governance_pb.js";
import type { RequestContext } from "../context.js";
import type { ObjectStore } from "../clients/object-store.js";
import type { CatalogRestoreClient } from "../clients/catalog.js";
import { getSnapshotById } from "../repo/snapshot-repo.js";
import { insertRestoreRequest, updateRestoreStatus } from "../repo/restore-repo.js";
import { decompressAndVerify, buildDimensionRestoreOps, buildCanonicalRestoreOps } from "../domain/restore.js";

const UuidSchema = z.string().uuid();

export interface RestoreDeps {
  pool: pg.Pool;
  objectStore: ObjectStore;
  catalogClient: CatalogRestoreClient;
  logger: pino.Logger;
}

export async function handleRestore(
  ctx: RequestContext,
  deps: RestoreDeps,
  request: RestoreRequest,
): Promise<RestoreResponse> {
  const parsed = UuidSchema.safeParse(request.snapshotId);
  if (!parsed.success) {
    throw new ConnectError("snapshot_id must be a UUID", Code.InvalidArgument);
  }
  if (!request.targetTimestamp) {
    throw new ConnectError("target_timestamp is required", Code.InvalidArgument);
  }
  if (!request.targetEnvironment.trim()) {
    throw new ConnectError("target_environment is required", Code.InvalidArgument);
  }
  if (request.targetEnvironment !== "staging") {
    throw new ConnectError(
      "Production restore is not available at MVP. Only target_environment='staging' is supported.",
      Code.FailedPrecondition,
    );
  }

  const snapshot = await getSnapshotById(deps.pool, ctx.orgId, request.snapshotId);
  if (!snapshot) {
    throw new ConnectError("Snapshot not found", Code.NotFound);
  }

  const restoreId = await insertRestoreRequest(deps.pool, {
    orgId: ctx.orgId,
    requestedBy: ctx.userId,
    snapshotId: request.snapshotId,
    targetTimestamp: timestampDate(request.targetTimestamp),
    targetEnvironment: request.targetEnvironment,
    approvalId: request.approvalId || undefined,
  });

  await updateRestoreStatus(deps.pool, ctx.orgId, restoreId, "running");

  try {
    deps.logger.info({ restoreId, snapshotId: request.snapshotId, orgId: ctx.orgId }, "downloading snapshot");
    const compressed = await deps.objectStore.getObject(snapshot.storageUrl);
    const snapshotData = decompressAndVerify(compressed, snapshot.checksum);

    const dimOps = buildDimensionRestoreOps(snapshotData);
    deps.logger.info(
      { restoreId, channels: dimOps.channels.length, locations: dimOps.locations.length, segments: dimOps.segments.length },
      "restoring dimensions",
    );

    for (const channel of dimOps.channels) {
      await deps.catalogClient.saveChannel(ctx.orgId, channel);
    }
    for (const location of dimOps.locations) {
      await deps.catalogClient.saveLocation(ctx.orgId, location);
    }
    for (const segment of dimOps.segments) {
      await deps.catalogClient.saveCustomerSegment(ctx.orgId, segment);
    }

    const batches = buildCanonicalRestoreOps(snapshotData, restoreId);
    deps.logger.info({ restoreId, batches: batches.length }, "restoring canonical data");

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      deps.logger.info({ restoreId, batch: i + 1, total: batches.length, rows: batch.rows.length }, "upserting batch");
      await deps.catalogClient.upsertCanonical(ctx.orgId, batch);
    }

    await updateRestoreStatus(deps.pool, ctx.orgId, restoreId, "completed");
    deps.logger.info({ restoreId }, "restore completed");

    return create(RestoreResponseSchema, { restoreId, status: "completed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateRestoreStatus(deps.pool, ctx.orgId, restoreId, "failed", message);
    deps.logger.error({ restoreId, err }, "restore failed");
    if (err instanceof ConnectError) throw err;
    throw new ConnectError(`Restore failed: ${message}`, Code.Internal);
  }
}
