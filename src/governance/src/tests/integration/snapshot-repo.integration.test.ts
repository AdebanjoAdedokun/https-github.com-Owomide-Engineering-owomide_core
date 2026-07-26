import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertSnapshot, getLatestSnapshot, listSnapshots } from "../../repo/snapshot-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

const ORG_A = "00000000-0000-0000-0000-000000000001";
const ORG_B = "00000000-0000-0000-0000-000000000002";
const ORG_C = "00000000-0000-0000-0000-000000000003";
const ORG_D = "00000000-0000-0000-0000-000000000004";

describe("snapshot repo integration", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let svcPool: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("governance_snapshot_test")
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

    svcPool = new pg.Pool({
      connectionString: container
        .getConnectionUri()
        .replace("postgres:postgres@", "governance_svc:test-password@"),
      max: 2,
    });
  }, 120_000);

  afterAll(async () => {
    await svcPool.end();
    await superuser.end();
    await container.stop();
  });

  it("inserts and reads back a snapshot row", async () => {
    const snapshotId = crypto.randomUUID();
    const snapshotAt = new Date().toISOString();

    await insertSnapshot(svcPool, {
      id: snapshotId,
      orgId: ORG_A,
      snapshotAt,
      scope: "catalog",
      storageUrl: `s3://owomide-snapshots/snapshots/${ORG_A}/${snapshotId}.json.gz`,
      rowCounts: { skus: 10, channels: 2 },
      checksum: "abc123",
    });

    const { rows } = await superuser.query(
      "SELECT id, org_id, scope, storage_url, row_counts, checksum FROM governance.snapshot WHERE id = $1",
      [snapshotId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].org_id).toBe(ORG_A);
    expect(rows[0].scope).toBe("catalog");
    expect(rows[0].row_counts).toEqual({ skus: 10, channels: 2 });
    expect(rows[0].checksum).toBe("abc123");
  });

  it("getLatestSnapshot returns the most recent snapshot for an org", async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    await insertSnapshot(svcPool, {
      id: id1,
      orgId: ORG_C,
      snapshotAt: "2026-07-25T10:00:00Z",
      scope: "catalog",
      storageUrl: `s3://owomide-snapshots/snapshots/${ORG_C}/${id1}.json.gz`,
      rowCounts: { skus: 5 },
      checksum: "old",
    });

    await insertSnapshot(svcPool, {
      id: id2,
      orgId: ORG_C,
      snapshotAt: "2026-07-26T10:00:00Z",
      scope: "catalog",
      storageUrl: `s3://owomide-snapshots/snapshots/${ORG_C}/${id2}.json.gz`,
      rowCounts: { skus: 8 },
      checksum: "new",
    });

    const latest = await getLatestSnapshot(svcPool, ORG_C);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(id2);
    expect(latest!.checksum).toBe("new");
  });

  it("getLatestSnapshot returns null for org with no snapshots", async () => {
    const unknownOrg = "00000000-0000-0000-0000-999999999999";
    const latest = await getLatestSnapshot(svcPool, unknownOrg);
    expect(latest).toBeNull();
  });

  it("listSnapshots paginates correctly", async () => {
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
    for (let i = 0; i < ids.length; i++) {
      await insertSnapshot(svcPool, {
        id: ids[i]!,
        orgId: ORG_D,
        snapshotAt: new Date(Date.now() - (ids.length - i) * 60_000).toISOString(),
        scope: "catalog",
        storageUrl: `s3://owomide-snapshots/snapshots/${ORG_D}/${ids[i]}.json.gz`,
        rowCounts: { skus: i },
        checksum: `check-${i}`,
      });
    }

    const page1 = await listSnapshots(svcPool, ORG_D, 2, 0);
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);

    const page2 = await listSnapshots(svcPool, ORG_D, 2, 2);
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });

  it("snapshots are org-scoped via RLS", async () => {
    const id = crypto.randomUUID();
    await insertSnapshot(svcPool, {
      id,
      orgId: ORG_A,
      snapshotAt: new Date().toISOString(),
      scope: "catalog",
      storageUrl: `s3://owomide-snapshots/rls-test/${id}.json.gz`,
      rowCounts: {},
      checksum: "rls",
    });

    const fromB = await getLatestSnapshot(svcPool, ORG_B);
    const bSnapshots = await listSnapshots(svcPool, ORG_B, 100, 0);
    const bIds = bSnapshots.rows.map((r) => r.id);
    expect(bIds).not.toContain(id);
    if (fromB) {
      expect(fromB.id).not.toBe(id);
    }
  });
});
