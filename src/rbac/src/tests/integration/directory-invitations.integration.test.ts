import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 0007: the permission directory Notify uses and invitation acceptance (ORG-003,
// ORG-004). Runs against a disposable container, or against RBAC_TEST_DATABASE_URL (a superuser
// URL for an empty database).

const MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_rbac_foundation.up.sql",
  "0003_seed_system_roles.up.sql",
  "0004_lock_system_roles.up.sql",
  "0005_organisations_membership_support_access.up.sql",
  "0006_seed_workspace_admin_role.up.sql",
  "0007_directory_and_invitations.up.sql",
];
const sql = (f: string) => readFileSync(resolve(process.cwd(), "migrations", f), "utf8");
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("Permission directory and invitations", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let svc: pg.Client;
  let org: string;

  beforeAll(async () => {
    let adminUrl = process.env.RBAC_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("owomide_rbac_test")
        .start();
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
    org = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT rbac.create_organisation('idp|femi', 'femi@example.test', 'Femi', 'Illustrative Stores',
                                         'NG', 'NGN', 'Africa/Lagos', 'enabled_without_cost_margin') AS id`
      );
      return rows[0].id as string;
    });
  });

  afterAll(async () => {
    await svc?.end();
    await admin?.end();
    await container?.stop();
  });

  async function tx<T>(fn: (c: pg.Client) => Promise<T>, orgId?: string): Promise<T> {
    await svc.query("BEGIN");
    try {
      if (orgId) await svc.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      const out = await fn(svc);
      await svc.query("COMMIT");
      return out;
    } catch (err) {
      await svc.query("ROLLBACK");
      throw err;
    }
  }

  async function invite(email: string, roles: string[], expiresIn = "7 days"): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await tx(
      (c) =>
        c.query(
          `INSERT INTO rbac.invitation (org_id, email, role_codes, token_sha256, invited_by, expires_at)
           VALUES ($1, $2, $3, $4, 'idp|femi', clock_timestamp() + $5::interval)`,
          [org, email, roles, sha256(token), expiresIn]
        ),
      org
    );
    return token;
  }

  const accept = (token: string, subject: string, email: string) =>
    tx(async (c) => {
      const { rows } = await c.query(`SELECT rbac.accept_invitation($1, $2, $3, $4) AS org`, [
        token,
        subject,
        email,
        subject,
      ]);
      return rows[0].org as string;
    });

  const holders = (permission: string, orgId = org) =>
    tx(
      async (c) =>
        (
          await c.query(`SELECT identity_subject, email FROM rbac.members_with_permission($1)`, [
            permission,
          ])
        ).rows,
      orgId
    );

  it("accepts an invitation once, creating the membership and roles", async () => {
    const token = await invite("Tunde@Example.test", ["finance_approver"]);
    expect(await accept(token, "idp|tunde", "tunde@example.test")).toBe(org);
    const roles = await tx(
      async (c) =>
        (await c.query(`SELECT rbac.active_role_codes($1, 'idp|tunde') AS r`, [org])).rows[0].r,
      org
    );
    expect(roles).toEqual(["finance_approver"]);
    await expect(accept(token, "idp|tunde", "tunde@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
    const log = await tx(
      async (c) => (await c.query(`SELECT action FROM rbac.access_log ORDER BY occurred_at`)).rows,
      org
    );
    expect(log.map((r) => r.action)).toEqual(["organisation.create", "invitation.accept"]);
  });

  it("refuses wrong, expired and mismatched invitations with the same message", async () => {
    const token = await invite("ada@example.test", ["pricing_manager"]);
    await expect(accept("x".repeat(43), "idp|ada", "ada@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
    await expect(accept(token, "idp|mallory", "mallory@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
    await expect(accept("short", "idp|ada", "ada@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
    // Expired: make it expire now (as the table owner, to simulate the passage of time).
    const expired = await invite("old@example.test", ["executor"]);
    await admin.query(
      `UPDATE rbac.invitation SET created_at = created_at - interval '8 days',
              expires_at = clock_timestamp() - interval '1 day' WHERE token_sha256 = $1`,
      [sha256(expired)]
    );
    await expect(accept(expired, "idp|old", "old@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
    // The right person still can.
    expect(await accept(token, "idp|ada", "ada@example.test")).toBe(org);
  });

  it("never reactivates a suspended member", async () => {
    const first = await invite("kemi@example.test", ["executor"]);
    await accept(first, "idp|kemi", "kemi@example.test");
    await tx(
      (c) =>
        c.query(
          `UPDATE rbac.membership SET status = 'suspended', status_changed_by = 'idp|femi'
           WHERE user_id = (SELECT id FROM rbac.user_account WHERE identity_subject = 'idp|kemi')`
        ),
      org
    );
    const second = await invite("kemi@example.test", ["executor"]);
    await expect(accept(second, "idp|kemi", "kemi@example.test")).rejects.toThrow(
      /invitation is not valid/
    );
  });

  it("lists who holds a permission: active members with enabled roles only", async () => {
    expect(await holders("approval.approve")).toEqual([
      { identity_subject: "idp|tunde", email: "tunde@example.test" },
    ]);
    // Kemi is suspended, so no executor holds execution.mark_implemented.
    expect(await holders("execution.mark_implemented")).toEqual([]);
    expect((await holders("org_user.invite")).map((r) => r.identity_subject)).toEqual(["idp|femi"]);
    // Another organisation sees nobody.
    const other = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT rbac.create_organisation('idp|zed', 'zed@example.test', 'Zed', 'Other', 'NG', 'NGN',
                                         'Africa/Lagos', 'disabled') AS id`
      );
      return rows[0].id as string;
    });
    expect(await holders("approval.approve", other)).toEqual([]);
  });

  it("does not let the service read invitations of another organisation", async () => {
    const other = await tx(
      async (c) => (await c.query(`SELECT id FROM rbac.organisation`)).rows as { id: string }[],
      org
    );
    expect(other.map((r) => r.id)).toEqual([org]);
    const seen = await tx(
      async (c) => (await c.query(`SELECT count(*)::int AS n FROM rbac.invitation`)).rows[0].n,
      "org-nobody"
    );
    expect(seen).toBe(0);
  });

  it("rolls back cleanly", async () => {
    await admin.query(sql("0007_directory_and_invitations.down.sql"));
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'rbac' AND p.proname IN ('accept_invitation', 'members_with_permission')`
    );
    expect(rows[0].n).toBe(0);
  });
});
