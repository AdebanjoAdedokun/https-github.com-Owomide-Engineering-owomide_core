import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 0005: organisations, membership, role assignments, invitations, support access and
// the access log (decisions D-02, D-03; PRD ORG-001 to ORG-015). Runs against a disposable
// container, or against RBAC_TEST_DATABASE_URL (a superuser URL for an empty database).

const MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_rbac_foundation.up.sql",
  "0003_seed_system_roles.up.sql",
  "0004_lock_system_roles.up.sql",
  "0005_organisations_membership_support_access.up.sql",
];
const sql = (f: string) => readFileSync(resolve(process.cwd(), "migrations", f), "utf8");

describe("Organisations, membership and support access", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let svc: pg.Client;

  beforeAll(async () => {
    let adminUrl = process.env.RBAC_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("owomide_rbac_test").start();
      adminUrl = container.getConnectionUri();
    }
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      "DO $$ BEGIN CREATE ROLE rbac_svc LOGIN PASSWORD 'rbac_test'; EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    );
    await admin.query("CREATE SCHEMA IF NOT EXISTS rbac");
    await admin.query("GRANT USAGE ON SCHEMA rbac TO rbac_svc");
    for (const f of MIGRATIONS) await admin.query(sql(f));
    const url = new URL(adminUrl);
    url.username = "rbac_svc";
    url.password = "rbac_test";
    svc = new pg.Client({ connectionString: url.toString() });
    await svc.connect();
  });

  afterAll(async () => {
    await svc?.end();
    await admin?.end();
    await container?.stop();
  });

  async function inOrg<T>(org: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
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

  async function createOrg(subject: string, email: string): Promise<string> {
    await svc.query("BEGIN");
    try {
      const { rows } = await svc.query(
        `SELECT rbac.create_organisation($1, $2, $3, 'Illustrative Stores', 'NG', 'NGN', 'Africa/Lagos',
                                         true, 750, 'enabled_without_cost_margin') AS id`,
        [subject, email, "Femi"]
      );
      await svc.query("COMMIT");
      return rows[0].id as string;
    } catch (err) {
      await svc.query("ROLLBACK");
      throw err;
    }
  }

  async function addMember(org: string, subject: string, email: string, roles: string[]): Promise<string> {
    return inOrg(org, async (c) => {
      const u = await c.query(
        `INSERT INTO rbac.user_account (identity_subject, email) VALUES ($1, $2)
         ON CONFLICT (identity_subject) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
        [subject, email]
      );
      const m = await c.query(
        `INSERT INTO rbac.membership (org_id, user_id, status, joined_at) VALUES ($1, $2, 'active', now()) RETURNING id`,
        [org, u.rows[0].id]
      );
      for (const role of roles) {
        await c.query(
          `INSERT INTO rbac.role_assignment (org_id, membership_id, role_code, granted_by) VALUES ($1, $2, $3, 'femi')`,
          [org, m.rows[0].id, role]
        );
      }
      return m.rows[0].id as string;
    });
  }

  const rolesOf = (org: string, subject: string) =>
    inOrg(org, async (c) => (await c.query(`SELECT rbac.active_role_codes($1, $2) AS r`, [org, subject])).rows[0].r);

  it("creates a workspace with its creator as the active Account Owner", async () => {
    const org = await createOrg("idp|femi-1", "femi1@example.test");
    expect(await rolesOf(org, "idp|femi-1")).toEqual(["account_owner"]);
    const log = await inOrg(org, (c) => c.query(`SELECT action FROM rbac.access_log`));
    expect(log.rows.map((r) => r.action)).toEqual(["organisation.create"]);
  });

  it("assigns only the roles the organisation has enabled (Release 1: four)", async () => {
    const org = await createOrg("idp|femi-2", "femi2@example.test");
    await addMember(org, "idp|ada-2", "ada2@example.test", ["pricing_manager"]);
    await expect(addMember(org, "idp|bisi-2", "bisi2@example.test", ["commercial_approver"])).rejects.toThrow(
      /not enabled for this organisation/
    );
  });

  it("never leaves an organisation without an active Account Owner", async () => {
    const org = await createOrg("idp|femi-3", "femi3@example.test");
    await expect(
      inOrg(org, (c) =>
        c.query(`UPDATE rbac.role_assignment SET revoked_at = now(), revoked_by = 'femi' WHERE role_code = 'account_owner'`)
      )
    ).rejects.toThrow(/at least one active Account Owner/);
    await expect(inOrg(org, (c) => c.query(`UPDATE rbac.membership SET status = 'suspended'`))).rejects.toThrow(
      /at least one active Account Owner/
    );
    // A transfer in one transaction is allowed.
    await addMember(org, "idp|ada-3", "ada3@example.test", ["pricing_manager"]);
    await inOrg(org, async (c) => {
      const ada = await c.query(
        `SELECT m.id FROM rbac.membership m JOIN rbac.user_account u ON u.id = m.user_id WHERE u.identity_subject = 'idp|ada-3'`
      );
      await c.query(
        `INSERT INTO rbac.role_assignment (org_id, membership_id, role_code, granted_by) VALUES ($1, $2, 'account_owner', 'femi')`,
        [org, ada.rows[0].id]
      );
      await c.query(
        `UPDATE rbac.role_assignment ra SET revoked_at = now(), revoked_by = 'femi'
           FROM rbac.membership m JOIN rbac.user_account u ON u.id = m.user_id
          WHERE ra.membership_id = m.id AND u.identity_subject = 'idp|femi-3' AND ra.role_code = 'account_owner'`
      );
    });
    expect(await rolesOf(org, "idp|ada-3")).toEqual(["account_owner", "pricing_manager"]);
    expect(await rolesOf(org, "idp|femi-3")).toEqual([]);
  });

  it("stops authority at once when a role is revoked or a member suspended", async () => {
    const org = await createOrg("idp|femi-4", "femi4@example.test");
    await addMember(org, "idp|tunde-4", "tunde4@example.test", ["finance_approver"]);
    expect(await rolesOf(org, "idp|tunde-4")).toEqual(["finance_approver"]);
    await inOrg(org, (c) =>
      c.query(
        `UPDATE rbac.membership m SET status = 'suspended', status_changed_by = 'femi'
           FROM rbac.user_account u WHERE u.id = m.user_id AND u.identity_subject = 'idp|tunde-4'`
      )
    );
    expect(await rolesOf(org, "idp|tunde-4")).toEqual([]);
  });

  it("revokes role assignments but never rewrites or deletes them", async () => {
    const org = await createOrg("idp|femi-5", "femi5@example.test");
    await addMember(org, "idp|kemi-5", "kemi5@example.test", ["executor"]);
    await expect(inOrg(org, (c) => c.query(`UPDATE rbac.role_assignment SET role_code = 'account_owner' WHERE role_code = 'executor'`))).rejects.toThrow(
      /only be revoked/
    );
    await expect(inOrg(org, (c) => c.query(`DELETE FROM rbac.role_assignment`))).rejects.toThrow(/permission denied/);
  });

  it("time-boxes support access to at most 30 days and only allows revocation", async () => {
    const org = await createOrg("idp|femi-6", "femi6@example.test");
    await expect(
      inOrg(org, (c) =>
        c.query(
          `INSERT INTO rbac.support_access_grant (org_id, owomide_user_id, purpose, granted_by, ends_at)
           VALUES ($1, 'owomide|sam', 'onboarding', 'femi', now() + interval '31 days')`,
          [org]
        )
      )
    ).rejects.toThrow(/check constraint/);
    const grant = await inOrg(org, async (c) =>
      (
        await c.query(
          `INSERT INTO rbac.support_access_grant (org_id, owomide_user_id, purpose, granted_by, ends_at)
           VALUES ($1, 'owomide|sam', 'onboarding and data import', 'femi', now() + interval '7 days') RETURNING id`,
          [org]
        )
      ).rows[0].id
    );
    await expect(
      inOrg(org, (c) => c.query(`UPDATE rbac.support_access_grant SET ends_at = now() + interval '20 days' WHERE id = $1`, [grant]))
    ).rejects.toThrow(/only be revoked/);
    await inOrg(org, (c) =>
      c.query(`INSERT INTO rbac.access_log (org_id, actor_user_id, via_support_grant_id, action, resource) VALUES ($1, 'owomide|sam', $2, 'import.map', 'batch-1')`, [
        org,
        grant,
      ])
    );
    await inOrg(org, (c) => c.query(`UPDATE rbac.support_access_grant SET revoked_at = now(), revoked_by = 'femi' WHERE id = $1`, [grant]));
    await expect(inOrg(org, (c) => c.query(`UPDATE rbac.access_log SET action = 'x'`))).rejects.toThrow(/permission denied/);
    await expect(inOrg(org, (c) => c.query(`DELETE FROM rbac.access_log`))).rejects.toThrow(/permission denied/);
  });

  it("stores only a hash of each invitation token and bounds its lifetime", async () => {
    const org = await createOrg("idp|femi-7", "femi7@example.test");
    await expect(
      inOrg(org, (c) =>
        c.query(
          `INSERT INTO rbac.invitation (org_id, email, role_codes, token_sha256, invited_by, expires_at)
           VALUES ($1, 'ada@example.test', ARRAY['pricing_manager'], 'plain-token', 'femi', now() + interval '2 days')`,
          [org]
        )
      )
    ).rejects.toThrow(/check constraint/);
    await expect(
      inOrg(org, (c) =>
        c.query(
          `INSERT INTO rbac.invitation (org_id, email, role_codes, token_sha256, invited_by, expires_at)
           VALUES ($1, 'ada@example.test', ARRAY['pricing_manager'], $2, 'femi', now() + interval '30 days')`,
          [org, "b".repeat(64)]
        )
      )
    ).rejects.toThrow(/check constraint/);
  });

  it("keeps each organisation's people and logs invisible to others", async () => {
    const orgA = await createOrg("idp|femi-8", "femi8@example.test");
    await createOrg("idp|femi-9", "femi9@example.test");
    const seen = await inOrg("org-that-is-not-mine", async (c) => ({
      orgs: (await c.query(`SELECT id FROM rbac.organisation`)).rowCount,
      members: (await c.query(`SELECT id FROM rbac.membership`)).rowCount,
      logs: (await c.query(`SELECT id FROM rbac.access_log`)).rowCount,
    }));
    expect(seen).toEqual({ orgs: 0, members: 0, logs: 0 });
    const own = await inOrg(orgA, async (c) => (await c.query(`SELECT id FROM rbac.organisation`)).rowCount);
    expect(own).toBe(1);
  });

  it("rolls back cleanly", async () => {
    await admin.query(sql("0005_organisations_membership_support_access.down.sql"));
    const { rows } = await admin.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'rbac' AND tablename IN ('organisation', 'membership', 'access_log')`
    );
    expect(rows).toEqual([]);
  });
});
