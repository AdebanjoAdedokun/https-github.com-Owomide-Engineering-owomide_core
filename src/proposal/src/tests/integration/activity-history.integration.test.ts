import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeActivity } from "../../domain/activity.js";
import { listActivity } from "../../repo/activity-repository.js";

// Migration 0007: the Initiative and Proposal history view. Runs against a disposable container,
// or against PROPOSAL_TEST_DATABASE_URL (a superuser URL for an empty database) where containers
// are unavailable.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");
const sql = (f: string) => readFileSync(resolve(migrationsDir, f), "utf8");

const ORG = "org-a";
const ADA = "user-ada"; // Pricing Manager
const TUNDE = "user-tunde"; // Finance Approver
const KEMI = "user-kemi"; // Executor
const NAMES: Record<string, string> = { [ADA]: "Ada", [TUNDE]: "Tunde", [KEMI]: "Kemi" };

describe("Initiative and Proposal history", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let superuser: pg.Client;
  let svc: pg.Client;
  let initiativeId: string;
  let proposalId: string;

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
      "0007_activity_history.up.sql",
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

  const one = async (c: pg.Client, text: string, values: unknown[] = []) =>
    (await c.query(text, values)).rows[0];

  async function newVersion(number: number, previous: string | null): Promise<string> {
    return asOrg(ORG, async (c) => {
      const v = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, previous_version_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ORG, proposalId, number, ADA, previous]
      );
      await c.query(
        `UPDATE proposal.proposal_version SET status = 'awaiting_approval', submitted_by = $2,
                submitted_at = clock_timestamp(), snapshot = '{"lines": 40}', snapshot_hash = $3
          WHERE id = $1`,
        [v.id, ADA, `sha256:v${number}`]
      );
      return v.id as string;
    });
  }

  const decide = (versionId: string, outcome: string, reason: string) =>
    asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.decision (org_id, proposal_version_id, outcome, decided_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [ORG, versionId, outcome, TUNDE, reason]
      )
    );

  it("tells the whole story from creation to a partly implemented approval, in order", async () => {
    ({ initiativeId, proposalId } = await asOrg(ORG, async (c) => {
      const i = await one(
        c,
        `INSERT INTO proposal.initiative (org_id, type, title, owner_user_id, created_by, created_from)
         VALUES ($1, 'cost_driven_repricing', 'Beverage cost increase', $2, $2, 'margin_exposure_view')
         RETURNING id`,
        [ORG, ADA]
      );
      await c.query(
        `INSERT INTO proposal.initiative_transition (org_id, initiative_id, from_state, to_state, actor_id)
         VALUES ($1, $2, NULL, 'initiated', $3), ($1, $2, 'initiated', 'in_development', $3)`,
        [ORG, i.id, ADA]
      );
      await c.query(
        `INSERT INTO proposal.initiative_assumption (org_id, initiative_id, statement, author_id)
         VALUES ($1, $2, 'Supplier increase holds for the quarter', $3)`,
        [ORG, i.id, ADA]
      );
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title, initiative_id)
         VALUES ($1, 'draft', $2, 'Beverages', $3) RETURNING id`,
        [ORG, ADA, i.id]
      );
      return { initiativeId: i.id as string, proposalId: p.id as string };
    }));

    const v1 = await newVersion(1, null);
    await decide(v1, "changes_requested", "Hold the three premium juices");
    await asOrg(ORG, async (c) => {
      const m = await one(
        c,
        `INSERT INTO proposal.initiative_scope_member (org_id, initiative_id, sku_id, channel_id, added_by)
         VALUES ($1, $2, 'BEV-00031', 'default', $3) RETURNING id`,
        [ORG, initiativeId, ADA]
      );
      await c.query(
        `UPDATE proposal.initiative_scope_member SET removed_by = $2, removed_at = clock_timestamp(),
                removal_reason = 'Premium line held' WHERE id = $1`,
        [m.id, ADA]
      );
    });
    const v2 = await newVersion(2, v1);
    await decide(v2, "approved", "");
    await asOrg(ORG, async (c) => {
      await c.query(
        `INSERT INTO proposal.export_event (org_id, proposal_version_id, kind, exported_by, line_count, file_sha256)
         VALUES ($1, $2, 'execution_csv', $3, 37, $4)`,
        [ORG, v2, KEMI, "b".repeat(64)]
      );
      for (const [sku, outcome, implemented, reason] of [
        ["BEV-00001", "implemented", 118000, ""],
        ["BEV-00002", "implemented_different", 47000, ""],
        ["BEV-00003", "failed", null, "Shelf label printer offline"],
      ] as const) {
        await c.query(
          `INSERT INTO proposal.implementation_line (org_id, proposal_version_id, sku_id, channel_id, outcome,
             authorised_price_minor, implemented_price_minor, currency, actual_effective_at, reference,
             failure_reason, recorded_by, request_id)
           VALUES ($1, $2, $3, 'default', $4, 118000, $5, 'NGN',
                   CASE WHEN $4 = 'failed' THEN NULL ELSE clock_timestamp() END,
                   CASE WHEN $4 = 'failed' THEN '' ELSE 'POS-7781' END, $6, $7, 'req-1')`,
          [ORG, v2, sku, outcome, implemented, reason, KEMI]
        );
      }
    });

    const entries = await asOrg(ORG, (c) => listActivity(c, { initiativeId, limit: 100 }));
    const story = entries.map((e) => describeActivity(e, (id) => NAMES[id]));
    expect(story).toEqual([
      'Ada created the initiative "Beverage cost increase".',
      "Ada moved the initiative from Initiated to In development.",
      "Ada recorded an assumption: Supplier increase holds for the quarter",
      "Ada started proposal version 1.",
      "Ada submitted proposal version 1 for approval.",
      "Tunde requested changes to proposal version 1. Reason: Hold the three premium juices",
      "Ada removed BEV-00031 from the scope. Reason: Premium line held",
      "Ada started proposal version 2.",
      "Ada submitted proposal version 2 for approval.",
      "Tunde approved proposal version 2.",
      "Kemi downloaded the price change file for proposal version 2 (37 lines).",
      "Kemi recorded results for proposal version 2: 1 implemented, 1 implemented at a different price, 1 failed.",
    ]);
  });

  it("filters to one Proposal and never exposes prices", async () => {
    const entries = await asOrg(ORG, (c) => listActivity(c, { proposalId, limit: 100 }));
    expect(entries.every((e) => e.proposalId === proposalId)).toBe(true);
    expect(entries.map((e) => e.kind)).not.toContain("initiative_created");
    const details = JSON.stringify(entries.map((e) => e.detail));
    expect(details).not.toMatch(/118000|47000|price_minor|cost|margin/);
  });

  it("shows another organisation nothing", async () => {
    const entries = await asOrg("org-b", (c) => listActivity(c, { initiativeId, limit: 100 }));
    expect(entries).toEqual([]);
    const all = await asOrg("org-b", (c) =>
      c.query(`SELECT count(*)::int AS n FROM proposal.activity`)
    );
    expect(all.rows[0].n).toBe(0);
  });

  it("is read-only and rolls back cleanly", async () => {
    await expect(asOrg(ORG, (c) => c.query(`DELETE FROM proposal.activity`))).rejects.toThrow();
    await superuser.query(sql("0007_activity_history.down.sql"));
    const { rows } = await superuser.query(
      `SELECT count(*)::int AS n FROM pg_views WHERE schemaname = 'proposal' AND viewname = 'activity'`
    );
    expect(rows[0].n).toBe(0);
  });
});
