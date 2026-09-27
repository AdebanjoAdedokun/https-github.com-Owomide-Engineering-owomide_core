import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 0005: Initiatives, frozen Proposal versions and decisions (decisions D-05, D-08).
// Runs against a disposable container, or against PROPOSAL_TEST_DATABASE_URL (a superuser URL
// for an empty database) where containers are unavailable.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");
const sql = (f: string) => readFileSync(resolve(migrationsDir, f), "utf8");

const ORG = "org-a";
const ADA = "user-ada"; // Pricing Manager: creates and submits
const TUNDE = "user-tunde"; // Finance Approver

describe("Initiatives, frozen versions and decisions", () => {
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

  // Each call runs in its own transaction with the tenant set, as the service does.
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

  async function newInitiative(): Promise<string> {
    return asOrg(ORG, async (c) => {
      const row = await one(
        c,
        `INSERT INTO proposal.initiative (org_id, type, title, objective, priority, owner_user_id, created_by, created_from)
         VALUES ($1, 'cost_driven_repricing', 'Beverage cost increase', 'restore gross margin to 18%', 'high', $2, $2, 'margin_exposure_view')
         RETURNING id`,
        [ORG, ADA]
      );
      return row.id as string;
    });
  }

  async function newProposalWithDraft(initiativeId: string) {
    return asOrg(ORG, async (c) => {
      const p = await one(
        c,
        `INSERT INTO proposal.proposal (org_id, state, actor_id, title, initiative_id)
         VALUES ($1, 'draft', $2, 'Beverages v1', $3) RETURNING id`,
        [ORG, ADA, initiativeId]
      );
      const v = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by)
         VALUES ($1, $2, 1, $3) RETURNING id`,
        [ORG, p.id, ADA]
      );
      await c.query(
        `INSERT INTO proposal.proposal_version_line (org_id, proposal_version_id, sku_id, channel_id, line)
         VALUES ($1, $2, 'BEV-00001', 'default', '{"proposed_price_minor": 118000}')`,
        [ORG, v.id]
      );
      return { proposalId: p.id as string, versionId: v.id as string };
    });
  }

  async function submit(versionId: string, by: string) {
    await asOrg(ORG, (c) =>
      c.query(
        `UPDATE proposal.proposal_version
            SET status = 'awaiting_approval', submitted_by = $2, submitted_at = clock_timestamp(),
                snapshot = '{"lines": 1}', snapshot_hash = 'sha256:test'
          WHERE id = $1`,
        [versionId, by]
      )
    );
  }

  const decide = (versionId: string, by: string, outcome: string, reason = "") =>
    asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.decision (org_id, proposal_version_id, outcome, decided_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [ORG, versionId, outcome, by, reason]
      )
    );

  const statusOf = (versionId: string) =>
    asOrg(ORG, async (c) =>
      (await one(c, "SELECT status FROM proposal.proposal_version WHERE id = $1", [versionId])).status
    );

  it("links a Proposal only to an Initiative in the same organisation", async () => {
    const otherOrgInitiative = await asOrg("org-b", async (c) =>
      (
        await one(
          c,
          `INSERT INTO proposal.initiative (org_id, type, title, owner_user_id, created_by)
           VALUES ('org-b', 'price_increase', 'Other org', 'user-x', 'user-x') RETURNING id`
        )
      ).id as string
    );
    await expect(
      asOrg(ORG, (c) =>
        c.query(
          `INSERT INTO proposal.proposal (org_id, state, actor_id, title, initiative_id)
           VALUES ($1, 'draft', $2, 'cross-org', $3)`,
          [ORG, ADA, otherOrgInitiative]
        )
      )
    ).rejects.toThrow(/proposal_initiative_fk/);
  });

  it("freezes a submitted version: no snapshot or line changes", async () => {
    const { versionId } = await newProposalWithDraft(await newInitiative());
    await submit(versionId, ADA);
    expect(await statusOf(versionId)).toBe("awaiting_approval");
    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.proposal_version SET snapshot = '{"lines": 2}' WHERE id = $1`, [versionId])
      )
    ).rejects.toThrow(/frozen/);
    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.proposal_version_line SET line = '{}' WHERE proposal_version_id = $1`, [
          versionId,
        ])
      )
    ).rejects.toThrow(/only change while the version is a draft/);
  });

  it("never lets the submitter decide their own version", async () => {
    const { versionId } = await newProposalWithDraft(await newInitiative());
    await submit(versionId, ADA);
    await expect(decide(versionId, ADA, "approved")).rejects.toThrow(/cannot decide it/);
    expect(await statusOf(versionId)).toBe("awaiting_approval");
  });

  it("requires a reason to reject or request changes, and binds the decision to one version", async () => {
    const { versionId } = await newProposalWithDraft(await newInitiative());
    await submit(versionId, ADA);
    await expect(decide(versionId, TUNDE, "changes_requested")).rejects.toThrow(/decision_check|check constraint/);
    await decide(versionId, TUNDE, "changes_requested", "Hold the three premium SKUs at current price");
    expect(await statusOf(versionId)).toBe("changes_requested");
    await expect(decide(versionId, TUNDE, "approved")).rejects.toThrow(/not awaiting approval/);
  });

  it("refuses a status change that no decision supports", async () => {
    const { versionId } = await newProposalWithDraft(await newInitiative());
    await submit(versionId, ADA);
    await expect(
      asOrg(ORG, (c) => c.query(`UPDATE proposal.proposal_version SET status = 'approved' WHERE id = $1`, [versionId]))
    ).rejects.toThrow(/can only follow its decision/);
  });

  it("revises into a new version without carrying authority over", async () => {
    const { proposalId, versionId: v1 } = await newProposalWithDraft(await newInitiative());
    await submit(v1, ADA);
    await decide(v1, TUNDE, "changes_requested", "Hold the premium SKUs");
    const v2 = await asOrg(ORG, async (c) => {
      const row = await one(
        c,
        `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, previous_version_id)
         VALUES ($1, $2, 2, $3, $4) RETURNING id, status`,
        [ORG, proposalId, ADA, v1]
      );
      await c.query(`UPDATE proposal.proposal_version SET superseded_by_version_id = $2 WHERE id = $1`, [v1, row.id]);
      return row;
    });
    expect(v2.status).toBe("draft");
    await submit(v2.id, ADA);
    await decide(v2.id, TUNDE, "approved");
    expect(await statusOf(v2.id)).toBe("approved");
    expect(await statusOf(v1)).toBe("changes_requested");
    await expect(
      asOrg(ORG, (c) => c.query(`UPDATE proposal.proposal_version SET superseded_by_version_id = NULL WHERE id = $1`, [v1]))
    ).rejects.toThrow(/already superseded/);
  });

  it("refuses to create a version that is already submitted or decided", async () => {
    const { proposalId } = await newProposalWithDraft(await newInitiative());
    await expect(
      asOrg(ORG, (c) =>
        c.query(
          `INSERT INTO proposal.proposal_version (org_id, proposal_id, version_number, created_by, status)
           VALUES ($1, $2, 9, $3, 'approved')`,
          [ORG, proposalId, ADA]
        )
      )
    ).rejects.toThrow(/starts as an unsubmitted draft|check constraint/);
  });

  it("keeps decisions, assumptions and transitions append-only for the service role", async () => {
    const initiativeId = await newInitiative();
    const { versionId } = await newProposalWithDraft(initiativeId);
    await submit(versionId, ADA);
    await decide(versionId, TUNDE, "approved");
    await expect(asOrg(ORG, (c) => c.query(`UPDATE proposal.decision SET reason = 'edited'`))).rejects.toThrow(
      /permission denied/
    );
    await expect(asOrg(ORG, (c) => c.query(`DELETE FROM proposal.decision`))).rejects.toThrow(/permission denied/);
    await asOrg(ORG, (c) =>
      c.query(
        `INSERT INTO proposal.initiative_assumption (org_id, initiative_id, statement, author_id)
         VALUES ($1, $2, 'Supplier quote of 910 not yet in cost records', $3)`,
        [ORG, initiativeId, ADA]
      )
    );
    await expect(asOrg(ORG, (c) => c.query(`DELETE FROM proposal.initiative_assumption`))).rejects.toThrow(
      /permission denied/
    );
    await expect(asOrg(ORG, (c) => c.query(`DELETE FROM proposal.proposal_version`))).rejects.toThrow(
      /permission denied/
    );
  });

  it("records scope removal with a reason and never rewrites a member", async () => {
    const initiativeId = await newInitiative();
    const member = await asOrg(ORG, (c) =>
      one(
        c,
        `INSERT INTO proposal.initiative_scope_member (org_id, initiative_id, sku_id, channel_id, added_by)
         VALUES ($1, $2, 'BEV-00297', 'default', $3) RETURNING id`,
        [ORG, initiativeId, ADA]
      )
    );
    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.initiative_scope_member SET removed_at = now(), removed_by = $2 WHERE id = $1`, [
          member.id,
          ADA,
        ])
      )
    ).rejects.toThrow(/check constraint/);
    await expect(
      asOrg(ORG, (c) =>
        c.query(`UPDATE proposal.initiative_scope_member SET sku_id = 'BEV-99999' WHERE id = $1`, [member.id])
      )
    ).rejects.toThrow(/only be removed/);
    await asOrg(ORG, (c) =>
      c.query(
        `UPDATE proposal.initiative_scope_member
            SET removed_at = now(), removed_by = $2, removal_reason = 'Needs more than 12%: separate initiative'
          WHERE id = $1`,
        [member.id, ADA]
      )
    );
  });

  it("keeps each organisation's Initiatives and versions invisible to others", async () => {
    await newProposalWithDraft(await newInitiative());
    const seen = await asOrg("org-c", async (c) => ({
      initiatives: (await c.query("SELECT id FROM proposal.initiative")).rowCount,
      versions: (await c.query("SELECT id FROM proposal.proposal_version")).rowCount,
      decisions: (await c.query("SELECT id FROM proposal.decision")).rowCount,
    }));
    expect(seen).toEqual({ initiatives: 0, versions: 0, decisions: 0 });
  });

  it("rolls back cleanly", async () => {
    await superuser.query(sql("0005_initiative_versions_decisions.down.sql"));
    const { rows } = await superuser.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'proposal'
        AND tablename IN ('initiative', 'proposal_version', 'decision')`
    );
    expect(rows).toEqual([]);
  });
});
