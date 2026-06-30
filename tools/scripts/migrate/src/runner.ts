import { readFileSync } from "node:fs";
import pg from "pg";
import { requireEnv, passwordEnvKey } from "./env.js";
import {
  loadManifest,
  filterToService,
  type ServiceEntry,
} from "./manifest.js";
import { discoverMigrations, migrationPath, hasDownFile } from "./sql-files.js";
import {
  ensureTrackingTable,
  getAppliedMigrations,
  recordMigration,
  removeMigration,
  getLastApplied,
} from "./tracker.js";

export interface ApplyResult {
  service: string;
  applied: string[];
  skipped: string[];
  errors: Array<{ filename: string; error: Error }>;
}

export interface DownResult {
  service: string;
  rolledBack: string[];
  errors: Array<{ filename: string; error: Error }>;
}

export interface RunOptions {
  databaseUrl: string;
  manifestPath: string;
  repoRoot: string;
  service?: string;
  dryRun?: boolean;
}

async function bootstrapServiceRole(
  client: pg.Client,
  entry: ServiceEntry,
): Promise<void> {
  const password = requireEnv(passwordEnvKey(entry.role));
  if (password.length > 200) {
    throw new Error(`Password for role ${entry.role} exceeds maximum length of 200 characters`);
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS "${entry.schema}"`);

  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT FROM pg_roles WHERE rolname = $1) AS exists`,
    [entry.role],
  );
  if (!rows[0]?.exists) {
    // DDL does not support $1 params — pg.escapeLiteral() is the safe alternative.
    // It handles single quotes, backslashes, and all other special characters correctly.
    await client.query(
      `CREATE ROLE "${entry.role}" LOGIN PASSWORD ${pg.escapeLiteral(password)}`,
    );
  }

  await client.query(`GRANT USAGE ON SCHEMA "${entry.schema}" TO "${entry.role}"`);

  await client.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${entry.schema}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${entry.role}"
  `);

  await client.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${entry.schema}"
      GRANT USAGE, SELECT ON SEQUENCES TO "${entry.role}"
  `);

  await client.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${entry.schema}"
      GRANT EXECUTE ON FUNCTIONS TO "${entry.role}"
  `);
}

async function applyMigration(
  client: pg.Client,
  service: string,
  stem: string,
  sqlPath: string,
): Promise<void> {
  const sql = readFileSync(sqlPath, "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await recordMigration(client, service, stem);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function revertMigration(
  client: pg.Client,
  service: string,
  stem: string,
  sqlPath: string,
): Promise<void> {
  const sql = readFileSync(sqlPath, "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await removeMigration(client, service, stem);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function runMigrations(opts: RunOptions): Promise<ApplyResult[]> {
  const services = loadManifest(opts.manifestPath);
  const targets = opts.service
    ? [filterToService(services, opts.service)]
    : services;

  const client = new pg.Client({ connectionString: opts.databaseUrl });
  await client.connect();

  const results: ApplyResult[] = [];

  try {
    await ensureTrackingTable(client);

    for (const entry of targets) {
      const result: ApplyResult = {
        service: entry.name,
        applied: [],
        skipped: [],
        errors: [],
      };

      await bootstrapServiceRole(client, entry);

      const discovered = discoverMigrations(entry.migrationsDir, opts.repoRoot);
      const applied = await getAppliedMigrations(client, entry.name);

      const pending = discovered.filter((stem) => !applied.has(stem));
      const skipped = discovered.filter((stem) => applied.has(stem));
      result.skipped = skipped;

      for (const stem of pending) {
        if (opts.dryRun) {
          result.applied.push(stem);
          continue;
        }
        const upPath = migrationPath(
          entry.migrationsDir,
          opts.repoRoot,
          stem,
          "up",
        );
        try {
          await applyMigration(client, entry.name, stem, upPath);
          result.applied.push(stem);
        } catch (err) {
          result.errors.push({ filename: stem, error: err as Error });
        }
      }

      results.push(result);
    }
  } finally {
    await client.end();
  }

  return results;
}

export async function runDown(
  opts: RunOptions & { steps: number },
): Promise<DownResult[]> {
  if (!opts.service) {
    throw new Error("--svc is required for migrate-down");
  }

  const services = loadManifest(opts.manifestPath);
  const entry = filterToService(services, opts.service);

  const client = new pg.Client({ connectionString: opts.databaseUrl });
  await client.connect();

  const result: DownResult = {
    service: entry.name,
    rolledBack: [],
    errors: [],
  };

  try {
    await ensureTrackingTable(client);

    const toRevert = await getLastApplied(client, entry.name, opts.steps);

    if (toRevert.length === 0) {
      console.log(`[${entry.name}] nothing to roll back`);
      return [result];
    }

    for (const stem of toRevert) {
      if (!hasDownFile(entry.migrationsDir, opts.repoRoot, stem)) {
        const err = new Error(`No .down.sql file found for ${stem}`);
        result.errors.push({ filename: stem, error: err });
        break;
      }

      const downPath = migrationPath(
        entry.migrationsDir,
        opts.repoRoot,
        stem,
        "down",
      );
      try {
        await revertMigration(client, entry.name, stem, downPath);
        result.rolledBack.push(stem);
      } catch (err) {
        result.errors.push({ filename: stem, error: err as Error });
        break;
      }
    }
  } finally {
    await client.end();
  }

  return [result];
}
