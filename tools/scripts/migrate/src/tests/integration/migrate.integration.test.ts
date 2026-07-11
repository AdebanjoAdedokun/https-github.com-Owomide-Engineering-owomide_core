import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { runMigrations, runDown } from "../../runner.js";
import { createMigrationFiles } from "../../sql-files.js";

// Set up env vars for role passwords before the runner reads them
process.env["CATALOG_SVC_PASSWORD"] = "test_catalog";
process.env["PROPOSAL_SVC_PASSWORD"] = "test_proposal";

function buildRepoRoot(): { repoRoot: string; manifestPath: string } {
  const repoRoot = join(tmpdir(), `migrate-integration-${Date.now()}`);

  // roles.yaml manifest
  mkdirSync(join(repoRoot, "infra/db"), { recursive: true });
  writeFileSync(
    join(repoRoot, "infra/db/roles.yaml"),
    `services:
  - name: catalog
    role: catalog_svc
    schema: catalog
    migrations_dir: src/catalog/migrations
  - name: proposal
    role: proposal_svc
    schema: proposal
    migrations_dir: src/proposal/migrations
`,
  );

  // Immutable bootstrap plus a real forward migration for catalog
  mkdirSync(join(repoRoot, "src/catalog/migrations"), { recursive: true });
  writeFileSync(
    join(repoRoot, "src/catalog/migrations/0001_create_schema.up.sql"),
    "SELECT 1; -- catalog placeholder",
  );
  writeFileSync(
    join(repoRoot, "src/catalog/migrations/0001_create_schema.down.sql"),
    "DROP SCHEMA IF EXISTS catalog CASCADE;",
  );
  writeFileSync(
    join(repoRoot, "src/catalog/migrations/0002_foundation.up.sql"),
    "CREATE TABLE catalog.foundation (id integer PRIMARY KEY);",
  );
  writeFileSync(
    join(repoRoot, "src/catalog/migrations/0002_foundation.down.sql"),
    "DROP TABLE catalog.foundation;",
  );

  // Immutable bootstrap plus a real forward migration for proposal
  mkdirSync(join(repoRoot, "src/proposal/migrations"), { recursive: true });
  writeFileSync(
    join(repoRoot, "src/proposal/migrations/0001_create_schema.up.sql"),
    "SELECT 1; -- proposal placeholder",
  );
  writeFileSync(
    join(repoRoot, "src/proposal/migrations/0001_create_schema.down.sql"),
    "DROP SCHEMA IF EXISTS proposal CASCADE;",
  );
  writeFileSync(
    join(repoRoot, "src/proposal/migrations/0002_foundation.up.sql"),
    "CREATE TABLE proposal.foundation (id integer PRIMARY KEY);",
  );
  writeFileSync(
    join(repoRoot, "src/proposal/migrations/0002_foundation.down.sql"),
    "DROP TABLE proposal.foundation;",
  );

  return { repoRoot, manifestPath: join(repoRoot, "infra/db/roles.yaml") };
}

describe("migration runner integration", () => {
  let container: StartedPostgreSqlContainer;
  let connectionString: string;
  let repoRoot: string;
  let manifestPath: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("owomide_test")
      .start();
    connectionString = container.getConnectionUri();

    const roots = buildRepoRoot();
    repoRoot = roots.repoRoot;
    manifestPath = roots.manifestPath;
  }, 90_000);

  afterAll(async () => {
    await container?.stop();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("creates schema_migrations tracking table on first run", async () => {
    await runMigrations({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
    });

    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query<{ to_regclass: string | null }>(
      "SELECT to_regclass('public.schema_migrations') AS to_regclass",
    );
    await client.end();

    expect(result.rows[0]?.to_regclass).not.toBeNull();
  });

  it("creates the schema for catalog", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'catalog'",
    );
    await client.end();
    expect(result.rows).toHaveLength(1);
  });

  it("creates the role for catalog", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname = 'catalog_svc'",
    );
    await client.end();
    expect(result.rows).toHaveLength(1);
  });

  it("records applied migrations in schema_migrations", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query<{
      filename: string;
      checksum: string | null;
    }>(
      "SELECT filename, checksum FROM public.schema_migrations WHERE service = 'catalog' AND direction = 'up' ORDER BY filename",
    );
    await client.end();
    expect(result.rows.map((r) => r.filename)).toEqual([
      "0001_create_schema",
      "0002_foundation",
    ]);
    expect(
      result.rows.every((r) => /^[0-9a-f]{64}$/.test(r.checksum ?? "")),
    ).toBe(true);
  });

  it("is idempotent — second apply does not re-run migrations", async () => {
    const results = await runMigrations({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
    });

    expect(results[0]?.applied).toHaveLength(0);
    expect(results[0]?.skipped).toEqual([
      "0001_create_schema",
      "0002_foundation",
    ]);
  });

  it("rejects an edited applied migration before running pending SQL", async () => {
    const path = join(
      repoRoot,
      "src/catalog/migrations/0001_create_schema.up.sql",
    );
    writeFileSync(path, "SELECT 2; -- edited history");

    try {
      await expect(
        runMigrations({
          databaseUrl: connectionString,
          manifestPath,
          repoRoot,
          service: "catalog",
        }),
      ).rejects.toThrow(/checksum mismatch.*catalog\/0001_create_schema/i);
    } finally {
      writeFileSync(path, "SELECT 1; -- catalog placeholder");
    }
  });

  it("rejects an edited rollback file", async () => {
    const path = join(
      repoRoot,
      "src/catalog/migrations/0001_create_schema.down.sql",
    );
    writeFileSync(path, "SELECT 1; -- edited rollback history");

    try {
      await expect(
        runMigrations({
          databaseUrl: connectionString,
          manifestPath,
          repoRoot,
          service: "catalog",
        }),
      ).rejects.toThrow(/checksum mismatch.*catalog\/0001_create_schema/i);
    } finally {
      writeFileSync(path, "DROP SCHEMA IF EXISTS catalog CASCADE;");
    }
  });

  it("rejects a deleted applied migration", async () => {
    const path = join(
      repoRoot,
      "src/catalog/migrations/0001_create_schema.up.sql",
    );
    rmSync(path);

    try {
      await expect(
        runMigrations({
          databaseUrl: connectionString,
          manifestPath,
          repoRoot,
          service: "catalog",
        }),
      ).rejects.toThrow(/missing from disk.*catalog\/0001_create_schema/i);
    } finally {
      writeFileSync(path, "SELECT 1; -- catalog placeholder");
    }
  });

  it("fails cleanly on bad SQL and does not record the migration", async () => {
    writeFileSync(
      join(repoRoot, "src/catalog/migrations/0003_bad.up.sql"),
      "THIS IS INVALID SQL !!!;",
    );
    writeFileSync(
      join(repoRoot, "src/catalog/migrations/0003_bad.down.sql"),
      "SELECT 1;",
    );
    writeFileSync(
      join(repoRoot, "src/catalog/migrations/0004_must_not_run.up.sql"),
      "CREATE TABLE catalog.must_not_run (id integer);",
    );
    writeFileSync(
      join(repoRoot, "src/catalog/migrations/0004_must_not_run.down.sql"),
      "DROP TABLE catalog.must_not_run;",
    );

    const results = await runMigrations({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
    });

    expect(results[0]?.errors).toHaveLength(1);
    expect(results[0]?.errors[0]?.filename).toBe("0003_bad");

    const client = new pg.Client({ connectionString });
    await client.connect();
    const check = await client.query<{ filename: string }>(
      "SELECT filename FROM public.schema_migrations WHERE service = 'catalog' AND filename IN ('0003_bad', '0004_must_not_run')",
    );
    const laterTable = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'must_not_run'",
    );
    await client.end();
    expect(check.rows).toHaveLength(0);
    expect(laterTable.rows).toHaveLength(0);

    // Clean up bad file
    rmSync(join(repoRoot, "src/catalog/migrations/0003_bad.up.sql"));
    rmSync(join(repoRoot, "src/catalog/migrations/0003_bad.down.sql"));
    rmSync(join(repoRoot, "src/catalog/migrations/0004_must_not_run.up.sql"));
    rmSync(join(repoRoot, "src/catalog/migrations/0004_must_not_run.down.sql"));
  });

  it("rolls back the last applied migration", async () => {
    const results = await runDown({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
      steps: 1,
    });

    expect(results[0]?.rolledBack).toContain("0002_foundation");

    const client = new pg.Client({ connectionString });
    await client.connect();
    const check = await client.query<{ filename: string }>(
      "SELECT filename FROM public.schema_migrations WHERE service = 'catalog' AND filename = '0002_foundation'",
    );
    await client.end();
    expect(check.rows).toHaveLength(0);
  });

  it("rolls back the remaining bootstrap migration", async () => {
    const results = await runDown({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
      steps: 1,
    });
    expect(results[0]?.rolledBack).toEqual(["0001_create_schema"]);
  });

  it("returns nothing-to-roll-back gracefully after full rollback", async () => {
    const results = await runDown({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "catalog",
      steps: 1,
    });
    expect(results[0]?.rolledBack).toHaveLength(0);
    expect(results[0]?.errors).toHaveLength(0);
  });

  it("upgrades legacy filename-only history and applies the new migration", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    await client.query(
      `INSERT INTO public.schema_migrations (service, filename, direction)
       VALUES ('proposal', '0001_create_schema', 'up')`,
    );
    await client.end();

    const results = await runMigrations({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
      service: "proposal",
    });

    expect(results[0]?.skipped).toEqual(["0001_create_schema"]);
    expect(results[0]?.applied).toEqual(["0002_foundation"]);

    const checkClient = new pg.Client({ connectionString });
    await checkClient.connect();
    const history = await checkClient.query<{
      filename: string;
      checksum: string | null;
    }>(
      "SELECT filename, checksum FROM public.schema_migrations WHERE service = 'proposal' ORDER BY filename",
    );
    const table = await checkClient.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'proposal' AND table_name = 'foundation'",
    );
    await checkClient.end();

    expect(history.rows).toHaveLength(2);
    expect(
      history.rows.every((row) => /^[0-9a-f]{64}$/.test(row.checksum ?? "")),
    ).toBe(true);
    expect(table.rows).toHaveLength(1);
  });

  it("runs both services when no --svc filter given", async () => {
    const results = await runMigrations({
      databaseUrl: connectionString,
      manifestPath,
      repoRoot,
    });

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.service).sort();
    expect(names).toEqual(["catalog", "proposal"]);
  });

  it("create command scaffolds both .up.sql and .down.sql", () => {
    const { up, down } = createMigrationFiles(
      "src/catalog/migrations",
      repoRoot,
      "catalog",
      "add_products_table",
    );
    expect(up).toMatch(/\d{4}_add_products_table\.up\.sql$/);
    expect(down).toMatch(/\d{4}_add_products_table\.down\.sql$/);
  });
});
