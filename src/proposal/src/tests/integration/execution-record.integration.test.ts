import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 0006: execution hand-off and implementation record (decision D-06).
// Runs against a disposable container, or against PROPOSAL_TEST_DATABASE_URL (a superuser URL
// for an empty database) where containers are unavailable.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");
const sql = (f: string) => readFileSync(resolve(migrationsDir, f), "utf8");

const ORG = "org-a";
const ADA = "user-ada";
const TUNDE = "user-tunde";
const KEMI = "user-kemi"; // Executor
const SHA = "a".repeat(64);

describe("Execution hand-off and implementation record", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let superuser: pg.Client;
  let svc: pg.Client;

  beforeAll(async () => {
    let adminUrl = process.env.PROPOSAL_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("proposal_test")
        .withUsername("postgres")
        .withPassword("postgres")
        .start();
      adminUrl = container.getConnectionUri();
    }
    superuser = new pg.Client({ connectionString: adminUrl });
    await superuser.connect();
    await superuser.query(
      "DO $$ BEGIN CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT; " +
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    );
    await superuser.query("CREATE SCHEMA IF NOT EXISTS proposal");
    await superuser.query("GRANT USAGE ON SCHEMA proposal TO proposal_svc");
    for (const f of [
      "0001_create_schema.up.sql",
      "0002_proposal_foundation.up.sql",
      "0003_scheduled_rollout_claim_fn.up.sql",
      "0004_harden_privileges.up.sql",
      "0005_initiative_versions_decisions.up.sql",
      "0006_execution_handoff_record.up.sql",
    ]) {
      await superuser.query(sql(f));
    }
    const url = new URL(adminUrl);
    url.username = "proposal_svc";
    url.password = "test-password";
    svc = new pg.Client({ connectionString: url.toString() });
    await svc.connect();
  });

  afterAll(async () => {
    await svc?.end();
    await superuser?.end();
    await container?.stop();
  });

  async function asOrg<T>(org: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
    await svc.query("BEGIN");
    try {
      await svc.query("SELECT set_config('app.org_id', $1, true)", [org]);
      const out = await fn(svc);
      await svc.query("COMMIT");
      return out;
    } catch (err) {
      await svc.query("ROLLBACK");
      throw err;
    }
  }

  const one = async (c: pg.Client, text: string, values: unknown[] = []) => (await c.query(text, values)).rows[0];

  /** A Proposal with version 1 submitted by Ada; decided by Tunde if an outcome is given. */
  async function version(outcome?: "approved" | "rejected" | "changes_requested") {
    const ids = await asOrg(ORG, async (c) => {
      const i = await one(
        c,
        `INSERT INTO proposal.initiative (org_id, type, title, owner_user_id, created_by)
         VALUES ($1, 'cost_driven_repricing', 'Beverages', $2, $2) RETURNING id`,
        [ORG, ADA]
      );
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title, initiative_id)
         VALUES ($1, 'draft', $2, 'Beverages', $3) RETURNING id`,
        [ORG, ADA, i.id]
      );
      const v = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by)
         VALUES ($1, $2, 1, $3) RETURNING id`,
        [ORG, p.id, ADA]
      );
      await c.query(
        `UPDATE proposal.proposal_version SET status = 'awaiting_approval', submitted_by = $2,
                submitted_at = clock_timestamp(), snapshot = '{"lines": 31}', snapshot_hash = 'sha256:x'
          WHERE id = $1`,
        [v.id, ADA]
      );
      return { proposalId: p.id as string, versionId: v.id as string };
    });
    if (outcome) {
      await asOrg(ORG, (c) =>
        c.query(
          `INSERT INTO proposal.decision (org_id, proposal_version_id, outcome, decided_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [ORG, ids.versionId, outcome, TUNDE, outcome === "approved" ? "" : "Not this time"]
        )
      );
    }
    return ids;
  }

  const exportFile = (versionId: string) =>
    asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.export_event (org_id, proposal_version_id, kind, exported_by, line_count, file_sha256)
         VALUES ($1, $2, 'execution_csv', $3, 31, $4)`,
        [ORG, versionId, KEMI, SHA]
      )
    );

  const record = (versionId: string, fields: Record<string, unknown>) =>
    asOrg(ORG, (c) => {
      const row = {
        org_id: ORG,
        proposal_version_id: versionId,
        sku_id: "BEV-00001",
        channel_id: "default",
        outcome: "implemented",
        authorised_price_minor: 118000,
        implemented_price_minor: 118000,
        currency: "NGN",
        actual_effective_at: "2026-10-20T08:00:00+01:00",
        reference: "POS-7781",
        failure_reason: "",
        recorded_by: KEMI,
        request_id: `req-${Math.random()}`,
        ...fields,
      };
      const cols = Object.keys(row);
      return c.query(
        `INSERT INTO proposal.implementation_line (${cols.join(", ")})
         VALUES (${cols.map((_, n) => `$${n + 1}`).join(", ")})
         ON CONFLICT DO NOTHING RETURNING id`,
        Object.values(row)
      );
    });

  it("exports and records only for an approved version", async () => {
    for (const outcome of [undefined, "rejected", "changes_requested"] as const) {
      const { versionId } = await version(outcome);
      await expect(exportFile(versionId)).rejects.toThrow(/is not approved/);
      await expect(record(versionId, {})).rejects.toThrow(/is not approved/);
    }
    const { versionId } = await version("approved");
    await expect(exportFile(versionId)).resolves.toBeDefined();
    await expect(record(versionId, {})).resolves.toBeDefined();
  });

  it("refuses an approved version once it is superseded", async () => {
    const { proposalId, versionId } = await version("approved");
    await asOrg(ORG, async (c) => {
      const v2 = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, previous_version_id)
         VALUES ($1, $2, 2, $3, $4) RETURNING id`,
        [ORG, proposalId, ADA, versionId]
      );
      await c.query(`UPDATE proposal.proposal_version SET superseded_by_version_id = $2 WHERE id = $1`, [versionId, v2.id]);
    });
    await expect(exportFile(versionId)).rejects.toThrow(/is superseded/);
  });

  it("requires the evidence each outcome needs", async () => {
    const { versionId } = await version("approved");
    await expect(record(versionId, { reference: "" })).rejects.toThrow(/check constraint/);
    await expect(record(versionId, { actual_effective_at: null })).rejects.toThrow(/check constraint/);
    await expect(
      record(versionId, { outcome: "failed", implemented_price_minor: null, reference: "", actual_effective_at: null })
    ).rejects.toThrow(/check constraint/);
    await expect(
      record(versionId, { outcome: "implemented", implemented_price_minor: 117900 })
    ).rejects.toThrow(/check constraint/);
    await expect(
      record(versionId, { outcome: "implemented_different", implemented_price_minor: 118000 })
    ).rejects.toThrow(/check constraint/);
    await expect(
      record(versionId, {
        outcome: "failed",
        implemented_price_minor: null,
        reference: "",
        actual_effective_at: null,
        failure_reason: "POS offline at Lekki",
      })
    ).resolves.toBeDefined();
  });

  it("never records the same request twice", async () => {
    const { versionId } = await version("approved");
    const first = await record(versionId, { request_id: "req-retry-1" });
    const retry = await record(versionId, { request_id: "req-retry-1" });
    expect(first.rowCount).toBe(1);
    expect(retry.rowCount).toBe(0);
    const count = await asOrg(ORG, async (c) =>
      Number((await one(c, `SELECT count(*) FROM proposal.implementation_line WHERE request_id = 'req-retry-1'`)).count)
    );
    expect(count).toBe(1);
  });

  it("keeps history: a fix is a new row and the latest row is current", async () => {
    const { versionId } = await version("approved");
    await record(versionId, {
      outcome: "failed",
      implemented_price_minor: null,
      reference: "",
      actual_effective_at: null,
      failure_reason: "POS offline",
    });
    await record(versionId, {});
    const rows = await asOrg(ORG, async (c) => ({
      all: (await c.query(`SELECT id FROM proposal.implementation_line WHERE proposal_version_id = $1`, [versionId])).rowCount,
      current: (
        await one(c, `SELECT outcome FROM proposal.implementation_line_current WHERE proposal_version_id = $1`, [versionId])
      ).outcome,
    }));
    expect(rows).toEqual({ all: 2, current: "implemented" });
  });

  it("is append-only for the service role", async () => {
    const { versionId } = await version("approved");
    await record(versionId, {});
    await exportFile(versionId);
    await expect(asOrg(ORG, (c) => c.query(`UPDATE proposal.implementation_line SET reference = 'x'`))).rejects.toThrow(
      /permission denied/
    );
    await expect(asOrg(ORG, (c) => c.query(`DELETE FROM proposal.export_event`))).rejects.toThrow(/permission denied/);
  });

  it("keeps each organisation's execution records invisible to others", async () => {
    const { versionId } = await version("approved");
    await record(versionId, {});
    const seen = await asOrg("org-z", async (c) => ({
      lines: (await c.query(`SELECT id FROM proposal.implementation_line`)).rowCount,
      current: (await c.query(`SELECT id FROM proposal.implementation_line_current`)).rowCount,
      exports: (await c.query(`SELECT id FROM proposal.export_event`)).rowCount,
    }));
    expect(seen).toEqual({ lines: 0, current: 0, exports: 0 });
  });

  it("rolls back cleanly", async () => {
    await superuser.query(sql("0006_execution_handoff_record.down.sql"));
    const { rows } = await superuser.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'proposal' AND tablename IN ('export_event', 'implementation_line')`
    );
    expect(rows).toEqual([]);
  });
});
