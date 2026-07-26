import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertSnapshot } from "../../repo/snapshot-repo.js";
import { getSnapshotById } from "../../repo/snapshot-repo.js";
import {
  insertRestoreRequest,
  updateRestoreStatus,
  getRestoreRequest,
} from "../../repo/restore-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

const ORG_A = "00000000-0000-0000-0000-000000000011";
const ORG_B = "00000000-0000-0000-0000-000000000012";
const ORG_C = "00000000-0000-0000-0000-000000000013";
const ORG_D = "00000000-0000-0000-0000-000000000014";

describe("restore-repo integration", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let svcPool: pg.Pool;
  let snapshotIdA: string;
  let snapshotIdB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("governance_restore_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE governance_svc LOGIN PASSWORD 'test-password' NOINHERIT",
    );
    await superuser.query("CREATE SCHEMA IF NOT EXISTS governance");
    await superuser.query("GRANT USAGE ON SCHEMA governance TO governance_svc");
    await superuser.query(sql("0001_create_schema.up.sql"));
    await superuser.query(sql("0002_audit_log_foundation.up.sql"));
    await superuser.query(sql("0003_snapshot.up.sql"));
    await superuser.query(sql("0004_restore_request.up.sql"));

    svcPool = new pg.Pool({
      connectionString: container
        .getConnectionUri()
        .replace("postgres:postgres@", "governance_svc:test-password@"),
      max: 2,
    });

    snapshotIdA = crypto.randomUUID();
    snapshotIdB = crypto.randomUUID();
    await insertSnapshot(svcPool, {
      id: snapshotIdA,
      orgId: ORG_A,
      snapshotAt: new Date().toISOString(),
      scope: "catalog",
      storageUrl: `s3://bucket/${snapshotIdA}.json.gz`,
      rowCounts: { skus: 5 },
      checksum: "aaa",
    });
    await insertSnapshot(svcPool, {
      id: snapshotIdB,
      orgId: ORG_B,
      snapshotAt: new Date().toISOString(),
      scope: "catalog",
      storageUrl: `s3://bucket/${snapshotIdB}.json.gz`,
      rowCounts: { skus: 3 },
      checksum: "bbb",
    });
  }, 120_000);

  afterAll(async () => {
    await svcPool.end();
    await superuser.end();
    await container.stop();
  });

  it("getSnapshotById returns the correct snapshot", async () => {
    const snap = await getSnapshotById(svcPool, ORG_A, snapshotIdA);
    expect(snap).not.toBeNull();
    expect(snap!.id).toBe(snapshotIdA);
    expect(snap!.orgId).toBe(ORG_A);
    expect(snap!.checksum).toBe("aaa");
  });

  it("getSnapshotById returns null for wrong org", async () => {
    const snap = await getSnapshotById(svcPool, ORG_B, snapshotIdA);
    expect(snap).toBeNull();
  });

  it("inserts and reads back a restore_request", async () => {
    const restoreId = await insertRestoreRequest(svcPool, {
      orgId: ORG_A,
      requestedBy: "user-1",
      snapshotId: snapshotIdA,
      targetTimestamp: new Date(),
      targetEnvironment: "staging",
    });

    const row = await getRestoreRequest(svcPool, ORG_A, restoreId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(restoreId);
    expect(row!.orgId).toBe(ORG_A);
    expect(row!.requestedBy).toBe("user-1");
    expect(row!.snapshotId).toBe(snapshotIdA);
    expect(row!.targetEnvironment).toBe("staging");
    expect(row!.status).toBe("pending");
    expect(row!.completedAt).toBeNull();
    expect(row!.errorMessage).toBeNull();
  });

  it("transitions status: pending → running → completed", async () => {
    const restoreId = await insertRestoreRequest(svcPool, {
      orgId: ORG_C,
      requestedBy: "user-2",
      snapshotId: snapshotIdA,
      targetTimestamp: new Date(),
      targetEnvironment: "staging",
    });

    await updateRestoreStatus(svcPool, ORG_C, restoreId, "running");
    let row = await getRestoreRequest(svcPool, ORG_C, restoreId);
    expect(row!.status).toBe("running");
    expect(row!.completedAt).toBeNull();

    await updateRestoreStatus(svcPool, ORG_C, restoreId, "completed");
    row = await getRestoreRequest(svcPool, ORG_C, restoreId);
    expect(row!.status).toBe("completed");
    expect(row!.completedAt).toBeInstanceOf(Date);
  });

  it("transitions status: pending → running → failed with error", async () => {
    const restoreId = await insertRestoreRequest(svcPool, {
      orgId: ORG_D,
      requestedBy: "user-3",
      snapshotId: snapshotIdA,
      targetTimestamp: new Date(),
      targetEnvironment: "staging",
    });

    await updateRestoreStatus(svcPool, ORG_D, restoreId, "running");
    await updateRestoreStatus(svcPool, ORG_D, restoreId, "failed", "Catalog unavailable");
    const row = await getRestoreRequest(svcPool, ORG_D, restoreId);
    expect(row!.status).toBe("failed");
    expect(row!.errorMessage).toBe("Catalog unavailable");
    expect(row!.completedAt).toBeInstanceOf(Date);
  });

  it("RLS isolates restore_requests by org", async () => {
    const restoreId = await insertRestoreRequest(svcPool, {
      orgId: ORG_A,
      requestedBy: "user-4",
      snapshotId: snapshotIdA,
      targetTimestamp: new Date(),
      targetEnvironment: "staging",
    });

    const fromA = await getRestoreRequest(svcPool, ORG_A, restoreId);
    expect(fromA).not.toBeNull();

    const fromB = await getRestoreRequest(svcPool, ORG_B, restoreId);
    expect(fromB).toBeNull();
  });
});
