import { randomUUID } from "node:crypto";
import type pg from "pg";
import type pino from "pino";
import { fromBinary } from "@bufbuild/protobuf";
import type { Subscriber, Subscription } from "@owomide/bus";
import {
  ProposalPublishedSchema,
  type ProposalPublished,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  ImportCommittedSchema,
  type ImportCommitted,
} from "@owomide/proto/events/import/v1_pb.js";
import type { CatalogSnapshotClient } from "../clients/catalog.js";
import type { ObjectStore } from "../clients/object-store.js";
import { buildSnapshot } from "../domain/snapshot.js";
import { insertSnapshot, getLatestSnapshot } from "../repo/snapshot-repo.js";

const SNAPSHOT_TOPICS = ["proposal.published", "import.committed"] as const;

interface SnapshotDeps {
  pool: pg.Pool;
  catalogClient: CatalogSnapshotClient;
  objectStore: ObjectStore;
  debounceMs: number;
}

function extractOrgId(eventType: string, payload: Uint8Array): string {
  if (eventType === "proposal.published") {
    const msg: ProposalPublished = fromBinary(ProposalPublishedSchema, payload);
    return msg.orgId;
  }
  const msg: ImportCommitted = fromBinary(ImportCommittedSchema, payload);
  return msg.orgId;
}

export async function startSnapshotSubscriber(
  subscriber: Subscriber,
  deps: SnapshotDeps,
  logger: pino.Logger,
): Promise<Subscription[]> {
  const subscriptions: Subscription[] = [];

  for (const topic of SNAPSHOT_TOPICS) {
    const sub = await subscriber.subscribe(
      { topic, group: "governance.snapshot", replayFrom: "latest" },
      async (event) => {
        try {
          const orgId = extractOrgId(event.type, event.payload);

          const latest = await getLatestSnapshot(deps.pool, orgId);
          if (latest) {
            const age = Date.now() - latest.snapshotAt.getTime();
            if (age < deps.debounceMs) {
              logger.debug({ orgId, eventId: event.id }, "snapshot debounced");
              return;
            }
          }

          const snapshotId = randomUUID();
          const result = await buildSnapshot(deps.catalogClient, orgId, snapshotId);
          const key = `snapshots/${orgId}/${snapshotId}.json.gz`;
          const { url } = await deps.objectStore.putObject(key, result.data, "application/gzip");

          await insertSnapshot(deps.pool, {
            id: snapshotId,
            orgId,
            snapshotAt: result.snapshotAt,
            scope: "catalog",
            storageUrl: url,
            rowCounts: result.rowCounts,
            checksum: result.checksum,
          });

          logger.info(
            { snapshotId, orgId, rowCounts: result.rowCounts, eventId: event.id },
            "snapshot created",
          );
        } catch (err) {
          logger.error({ err, eventId: event.id, eventType: event.type }, "snapshot failed");
          throw err;
        }
      },
    );
    subscriptions.push(sub);
  }

  logger.info({ topics: SNAPSHOT_TOPICS }, "snapshot subscriber started");
  return subscriptions;
}
