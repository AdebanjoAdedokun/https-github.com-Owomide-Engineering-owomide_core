import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareSummaryInput } from "../../ai/proposal-summary.js";
import {
  applySuggestion,
  listSuggestions,
  recordSummary,
} from "../../repo/ai-suggestion-repository.js";
import {
  ALLOWED_TRANSITIONS,
  INITIATIVE_STATES,
  reasonRequired,
} from "../../domain/initiative-lifecycle.js";

// Migrations 0008 (Initiative lifecycle), 0009 (cycle times) and 0010 (AI suggestion record).
// Runs against a disposable container, or against PROPOSAL_TEST_DATABASE_URL (a superuser URL
// for an empty database) where containers are unavailable.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");
const sql = (f: string) => readFileSync(resolve(migrationsDir, f), "utf8");
const MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_proposal_foundation.up.sql",
  "0003_scheduled_rollout_claim_fn.up.sql",
  "0004_harden_privileges.up.sql",
  "0005_initiative_versions_decisions.up.sql",
  "0006_execution_handoff_record.up.sql",
  "0007_activity_history.up.sql",
  "0008_initiative_lifecycle.up.sql",
  "0009_cycle_times.up.sql",
  "0010_ai_suggestion.up.sql",
];

const ORG = "org-a";
const ADA = "user-ada";
const TUNDE = "user-tunde";
const KEMI = "user-kemi";

describe("Initiative lifecycle, cycle times and AI suggestions", () => {
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
    for (const f of MIGRATIONS) await superuser.query(sql(f));
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

  const newInitiative = () =>
    asOrg(ORG, async (c) => {
      const i = await one(
        c,
        `INSERT INTO proposal.initiative (org_id, type, title, owner_user_id, created_by, created_at)
         VALUES ($1, 'cost_driven_repricing', 'Beverages', $2, $2, '2026-10-12T09:00:00Z') RETURNING id`,
        [ORG, ADA]
      );
      return i.id as string;
    });

  const move = (id: string, from: string | null, to: string, reason = "") =>
    asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.initiative_transition (org_id, initiative_id, from_state, to_state, actor_id, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ORG, id, from, to, ADA, reason]
      )
    );

  const stateOf = (id: string) =>
    asOrg(
      ORG,
      async (c) =>
        (await one(c, `SELECT lifecycle_state FROM proposal.initiative WHERE id = $1`, [id]))
          .lifecycle_state as string
    );

  it("enforces exactly the lifecycle table the code uses", async () => {
    const { rows } = await superuser.query(
      `SELECT f.s AS from_state, t.s AS to_state,
              proposal.initiative_transition_allowed(f.s, t.s) AS allowed,
              proposal.initiative_reason_required(f.s, t.s) AS reason
       FROM unnest($1::text[]) f(s), unnest($1::text[]) t(s)`,
      [INITIATIVE_STATES]
    );
    for (const r of rows) {
      const from = r.from_state as keyof typeof ALLOWED_TRANSITIONS;
      expect(r.allowed, `${from} -> ${r.to_state}`).toBe(
        ALLOWED_TRANSITIONS[from].includes(r.to_state)
      );
      expect(r.reason, `${from} -> ${r.to_state} reason`).toBe(reasonRequired(from, r.to_state));
    }
  });

  it("changes state only through allowed, reasoned transitions", async () => {
    const id = await newInitiative();
    await move(id, null, "initiated");
    await move(id, "initiated", "in_development");
    expect(await stateOf(id)).toBe("in_development");

    await expect(move(id, "in_development", "ready_for_execution")).rejects.toThrow(
      /cannot move from in_development to ready_for_execution/
    );
    await expect(move(id, "initiated", "in_development")).rejects.toThrow(
      /initiative is in_development, not initiated/
    );
    await expect(move(id, null, "initiated")).rejects.toThrow(/creation transition/);

    await move(id, "in_development", "awaiting_approval");
    await expect(move(id, "awaiting_approval", "in_development")).rejects.toThrow(/needs a reason/);
    await move(id, "awaiting_approval", "in_development", "Hold the premium lines");
    await move(id, "in_development", "on_hold", "Waiting for the supplier");
    await move(id, "on_hold", "in_development");
    expect(await stateOf(id)).toBe("in_development");

    // A chain of moves in one statement sees each earlier move.
    await asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.initiative_transition (org_id, initiative_id, from_state, to_state, actor_id)
         VALUES ($1, $2, 'in_development', 'in_review', $3), ($1, $2, 'in_review', 'awaiting_approval', $3)`,
        [ORG, id, ADA]
      )
    );
    expect(await stateOf(id)).toBe("awaiting_approval");
  });

  it("lets the service edit an Initiative's details but never its state directly", async () => {
    const id = await newInitiative();
    await asOrg(ORG, (c) =>
      c.query(`UPDATE proposal.initiative SET title = 'Beverages Q4' WHERE id = $1`, [id])
    );
    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.initiative SET lifecycle_state = 'completed' WHERE id = $1`, [id])
      )
    ).rejects.toThrow(/permission denied/);
    // Not even by setting the trigger's internal flag first.
    await expect(
      asOrg(ORG, async (c) => {
        await c.query(`SELECT set_config('proposal.applying_transition', 'on', true)`);
        await c.query(
          `UPDATE proposal.initiative SET lifecycle_state = 'completed' WHERE id = $1`,
          [id]
        );
      })
    ).rejects.toThrow(/permission denied/);
    // And not even as the table owner.
    await expect(
      superuser.query(
        `UPDATE proposal.initiative SET lifecycle_state = 'completed' WHERE id = $1`,
        [id]
      )
    ).rejects.toThrow(/only by recording a transition/);
    await expect(
      asOrg(ORG, (c) =>
        c.query(
          `INSERT INTO proposal.initiative (org_id, type, title, owner_user_id, created_by, lifecycle_state)
           VALUES ($1, 'price_increase', 'Skip ahead', $2, $2, 'ready_for_execution')`,
          [ORG, ADA]
        )
      )
    ).rejects.toThrow(/starts in the initiated state/);
  });

  it("measures each step of the journey from the records", async () => {
    const id = await newInitiative();
    const versionId = await asOrg(ORG, async (c) => {
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title, initiative_id)
         VALUES ($1, 'draft', $2, 'Beverages', $3) RETURNING id`,
        [ORG, ADA, id]
      );
      const v = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, created_at)
         VALUES ($1, $2, 1, $3, '2026-10-12T10:00:00Z') RETURNING id`,
        [ORG, p.id, ADA]
      );
      await c.query(
        `UPDATE proposal.proposal_version SET status = 'awaiting_approval', submitted_by = $2,
                submitted_at = '2026-10-12T11:30:00Z', snapshot = '{"lines": 31}', snapshot_hash = 'sha256:x'
          WHERE id = $1`,
        [v.id, ADA]
      );
      await c.query(
        `INSERT INTO proposal.decision (org_id, proposal_version_id, outcome, decided_by, decided_at)
         VALUES ($1, $2, 'approved', $3, '2026-10-12T15:30:00Z')`,
        [ORG, v.id, TUNDE]
      );
      await c.query(
        `INSERT INTO proposal.export_event (org_id, proposal_version_id, kind, exported_by, exported_at, line_count, file_sha256)
         VALUES ($1, $2, 'execution_csv', $3, '2026-10-13T08:00:00Z', 31, $4)`,
        [ORG, v.id, KEMI, "c".repeat(64)]
      );
      // A failure first, then the first line on the shelf the next morning.
      await c.query(
        `INSERT INTO proposal.implementation_line (org_id, proposal_version_id, sku_id, channel_id, outcome,
           authorised_price_minor, currency, failure_reason, recorded_by, recorded_at, request_id)
         VALUES ($1, $2, 'BEV-00003', 'default', 'failed', 118000, 'NGN', 'Printer offline', $3,
                 '2026-10-13T08:30:00Z', 'req-a')`,
        [ORG, v.id, KEMI]
      );
      await c.query(
        `INSERT INTO proposal.implementation_line (org_id, proposal_version_id, sku_id, channel_id, outcome,
           authorised_price_minor, implemented_price_minor, currency, actual_effective_at, reference,
           recorded_by, recorded_at, request_id)
         VALUES ($1, $2, 'BEV-00001', 'default', 'implemented', 118000, 118000, 'NGN',
                 '2026-10-13T09:00:00Z', 'POS-1', $3, '2026-10-13T09:15:00Z', 'req-b')`,
        [ORG, v.id, KEMI]
      );
      return v.id as string;
    });

    const version = await asOrg(ORG, (c) =>
      one(
        c,
        `SELECT seconds_to_submit, seconds_to_decision, seconds_decision_to_export,
                seconds_decision_to_first_implementation, outcome
         FROM proposal.version_cycle_time WHERE proposal_version_id = $1`,
        [versionId]
      )
    );
    expect(version).toEqual({
      seconds_to_submit: "5400", // 1h30
      seconds_to_decision: "14400", // 4h
      seconds_decision_to_export: "59400", // 16h30
      seconds_decision_to_first_implementation: "63900", // 17h45, the failure does not count
      outcome: "approved",
    });
    const initiative = await asOrg(ORG, (c) =>
      one(
        c,
        `SELECT versions_submitted, seconds_to_first_decision, seconds_to_approval,
                seconds_to_first_implementation
         FROM proposal.initiative_cycle_time WHERE initiative_id = $1`,
        [id]
      )
    );
    expect(initiative).toEqual({
      versions_submitted: 1,
      seconds_to_first_decision: "23400", // 6h30 from creation
      seconds_to_approval: "23400",
      seconds_to_first_implementation: "87300", // 24h15
    });
    const other = await asOrg("org-b", (c) =>
      one(c, `SELECT count(*)::int AS n FROM proposal.version_cycle_time`)
    );
    expect(other.n).toBe(0);
  });

  it("stores AI suggestions as returned and applies each once, by a person", async () => {
    const { draftId, submittedId } = await asOrg(ORG, async (c) => {
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title) VALUES ($1, 'draft', $2, 'AI') RETURNING id`,
        [ORG, ADA]
      );
      const s = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by)
         VALUES ($1, $2, 1, $3) RETURNING id`,
        [ORG, p.id, ADA]
      );
      await c.query(
        `UPDATE proposal.proposal_version SET status = 'awaiting_approval', submitted_by = $2,
                submitted_at = clock_timestamp(), snapshot = '{"lines": 1}', snapshot_hash = 'sha256:y'
          WHERE id = $1`,
        [s.id, ADA]
      );
      const d = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, previous_version_id)
         VALUES ($1, $2, 2, $3, $4) RETURNING id`,
        [ORG, p.id, ADA, s.id]
      );
      return { draftId: d.id as string, submittedId: s.id as string };
    });
    const suggest = (versionId: string) =>
      asOrg(ORG, async (c) =>
        one(
          c,
          `INSERT INTO proposal.ai_suggestion (org_id, proposal_version_id, kind, model, prompt_version,
             input_sha256, data_policy, output_text, requested_by)
           VALUES ($1, $2, 'proposal_summary', 'claude-sonnet-5', 'proposal-summary-v1', $3,
                   'enabled_without_cost_margin', '31 beverage prices rise by 3% to 12%.', $4)
           RETURNING id`,
          [ORG, versionId, "d".repeat(64), TUNDE]
        )
      );
    await expect(suggest(draftId)).rejects.toThrow(/submitted, frozen version/);
    const { id } = await suggest(submittedId);

    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.ai_suggestion SET output_text = 'edited' WHERE id = $1`, [id])
      )
    ).rejects.toThrow(/permission denied/);
    await asOrg(ORG, (c) =>
      c.query(
        `UPDATE proposal.ai_suggestion SET applied_by = $2, applied_at = clock_timestamp(),
                applied_text = '31 beverage prices rise; three premium lines held.' WHERE id = $1`,
        [id, TUNDE]
      )
    );
    await expect(
      asOrg(ORG, (c) =>
        c.query(
          `UPDATE proposal.ai_suggestion SET applied_by = $2, applied_at = clock_timestamp(),
                  applied_text = 'again' WHERE id = $1`,
          [id, ADA]
        )
      )
    ).rejects.toThrow(/applied only once/);
    await expect(
      asOrg(ORG, (c) => c.query(`DELETE FROM proposal.ai_suggestion WHERE id = $1`, [id]))
    ).rejects.toThrow(/permission denied/);
    const hidden = await asOrg("org-b", (c) =>
      one(c, `SELECT count(*)::int AS n FROM proposal.ai_suggestion`)
    );
    expect(hidden.n).toBe(0);
  });

  it("records a summary through the repository and lets a person apply it once", async () => {
    const versionId = await asOrg(ORG, async (c) => {
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title) VALUES ($1, 'draft', $2, 'Repo') RETURNING id`,
        [ORG, ADA]
      );
      const v = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by)
         VALUES ($1, $2, 1, $3) RETURNING id`,
        [ORG, p.id, ADA]
      );
      await c.query(
        `UPDATE proposal.proposal_version SET status = 'awaiting_approval', submitted_by = $2,
                submitted_at = clock_timestamp(), snapshot = '{"lines": 1}', snapshot_hash = 'sha256:z'
          WHERE id = $1`,
        [v.id, ADA]
      );
      return v.id as string;
    });
    const input = prepareSummaryInput(
      { lines: [{ sku_id: "BEV-1", cost: 1 }] },
      "enabled_without_cost_margin"
    );
    const stored = await asOrg(ORG, (c) =>
      recordSummary(c, {
        orgId: ORG,
        proposalVersionId: versionId,
        requestedBy: TUNDE,
        input,
        result: { model: "claude-opus-5", text: "One price rises." },
      })
    );
    expect(stored).toMatchObject({ dataPolicy: "enabled_without_cost_margin", appliedAt: null });
    const applied = await asOrg(ORG, (c) =>
      applySuggestion(c, {
        suggestionId: stored.id,
        appliedBy: TUNDE,
        appliedText: "One price rises by 9.8%.",
      })
    );
    expect(applied).toMatchObject({ appliedBy: TUNDE, appliedText: "One price rises by 9.8%." });
    const again = await asOrg(ORG, (c) =>
      applySuggestion(c, { suggestionId: stored.id, appliedBy: ADA, appliedText: "Other" })
    );
    expect(again).toBeNull();
    const list = await asOrg(ORG, (c) => listSuggestions(c, versionId));
    expect(list.map((x) => x.outputText)).toEqual(["One price rises."]);
  });

  it("rolls back cleanly", async () => {
    for (const f of [
      "0010_ai_suggestion.down.sql",
      "0009_cycle_times.down.sql",
      "0008_initiative_lifecycle.down.sql",
    ]) {
      await superuser.query(sql(f));
    }
    const { rows } = await superuser.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'proposal'
         AND c.relname IN ('ai_suggestion', 'version_cycle_time', 'initiative_cycle_time', 'initiative_lifecycle_rule')`
    );
    expect(rows[0].n).toBe(0);
    // The service can update the whole Initiative row again, as before 0008.
    const grant = await superuser.query(
      `SELECT has_table_privilege('proposal_svc', 'proposal.initiative', 'UPDATE') AS ok`
    );
    expect(grant.rows[0].ok).toBe(true);
  });
});
