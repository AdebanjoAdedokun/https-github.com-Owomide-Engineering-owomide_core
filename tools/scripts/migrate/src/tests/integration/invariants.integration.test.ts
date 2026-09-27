import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { checkInvariants } from "../../invariants.js";
import type { ServiceEntry } from "../../manifest.js";

// Builds two small service schemas the way the runner does (default privileges included), breaks
// each invariant once, and checks that exactly those breaks are reported, then fixes them.
// Runs against a disposable container, or MIGRATE_TEST_DATABASE_URL (superuser, empty database).

const services: ServiceEntry[] = [
  { name: "alpha", role: "alpha_svc", schema: "alpha", migrationsDir: "" },
  { name: "beta", role: "beta_svc", schema: "beta", migrationsDir: "" },
];

describe("checkInvariants", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let client: pg.Client;

  beforeAll(async () => {
    let url = process.env["MIGRATE_TEST_DATABASE_URL"];
    if (!url) {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
      url = container.getConnectionUri();
    }
    client = new pg.Client({ connectionString: url });
    await client.connect();
    for (const s of services) {
      await client.query(`DROP SCHEMA IF EXISTS ${s.schema} CASCADE`);
      await client.query(
        `DO $$ BEGIN CREATE ROLE ${s.role} LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
      await client.query(`CREATE SCHEMA ${s.schema}`);
      await client.query(`GRANT USAGE ON SCHEMA ${s.schema} TO ${s.role}`);
      // Exactly what runner.ts bootstraps.
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s.schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${s.role}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s.schema} GRANT EXECUTE ON FUNCTIONS TO ${s.role}`,
      );
    }
    await client.query(`
      CREATE TABLE alpha.tenant_data (id int PRIMARY KEY, org_id text NOT NULL);
      ALTER TABLE alpha.tenant_data ENABLE ROW LEVEL SECURITY;
      CREATE TABLE alpha.no_policy (id int PRIMARY KEY);
      ALTER TABLE alpha.no_policy ENABLE ROW LEVEL SECURITY;
      ALTER TABLE alpha.no_policy FORCE ROW LEVEL SECURITY;
      CREATE TABLE alpha.log (id int PRIMARY KEY);
      COMMENT ON TABLE alpha.log IS 'Events. @append-only';
      REVOKE DELETE ON alpha.log FROM alpha_svc;
      CREATE TABLE alpha.scratch (id int PRIMARY KEY);
      COMMENT ON TABLE alpha.scratch IS 'Rebuilt each run. @deletable';
      CREATE VIEW alpha.owner_view AS SELECT id FROM alpha.log;
      CREATE FUNCTION alpha.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
      GRANT USAGE ON SCHEMA beta TO alpha_svc;
    `);
  }, 120_000);

  afterAll(async () => {
    for (const s of services) await client?.query(`DROP SCHEMA IF EXISTS ${s.schema} CASCADE`);
    await client?.query(`REVOKE USAGE ON SCHEMA beta FROM alpha_svc`).catch(() => {});
    await client?.end();
    await container?.stop();
  }, 120_000);

  it("reports each broken invariant once, and nothing that is declared", async () => {
    const found = (await checkInvariants(client, services)).map(
      (f) => `${f.code} ${f.schema}.${f.object}`,
    );
    expect(found.sort()).toEqual(
      [
        "rls_not_forced alpha.tenant_data",
        "rls_without_policy alpha.tenant_data",
        "rls_without_policy alpha.no_policy",
        "delete_not_declared alpha.tenant_data",
        "delete_not_declared alpha.no_policy",
        "append_only_writable alpha.log",
        "view_not_security_invoker alpha.owner_view",
        "definer_without_search_path alpha.leaky()",
        "definer_executable_by_public alpha.leaky()",
        "cross_schema_access alpha.alpha_svc",
      ].sort(),
    );
  });

  it("passes once every table, view, function and grant is put right", async () => {
    await client.query(`
      ALTER TABLE alpha.tenant_data FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON alpha.tenant_data USING (org_id = current_setting('app.org_id', true));
      CREATE POLICY none ON alpha.no_policy USING (false);
      REVOKE DELETE ON alpha.tenant_data, alpha.no_policy FROM alpha_svc;
      REVOKE UPDATE ON alpha.log FROM alpha_svc;
      ALTER VIEW alpha.owner_view SET (security_invoker = true);
      ALTER FUNCTION alpha.leaky() SET search_path = pg_catalog, alpha;
      REVOKE ALL ON FUNCTION alpha.leaky() FROM PUBLIC;
      REVOKE USAGE ON SCHEMA beta FROM alpha_svc;
    `);
    expect(await checkInvariants(client, services)).toEqual([]);
  });
});
