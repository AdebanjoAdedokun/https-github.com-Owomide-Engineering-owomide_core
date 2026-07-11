import { readFileSync } from "node:fs";
import pg from "pg";
import { requireEnv, passwordEnvKey } from "./env.js";
import {
  loadManifest,
  filterToService,
  type ServiceEntry,
} from "./manifest.js";
import {
  discoverMigrations,
  migrationPath,
  migrationPairChecksum,
  hasDownFile,
} from "./sql-files.js";
import {
  ensureTrackingTable,
  getAppliedMigrations,
  recordMigration,
  backfillMigrationChecksum,
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
    throw new Error(
      `Password for role ${entry.role} exceeds maximum length of 200 characters`,
    );
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

  await client.query(
    `GRANT USAGE ON SCHEMA "${entry.schema}" TO "${entry.role}"`,
  );

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
  checksum: string,
): Promise<void> {
  const sql = readFileSync(sqlPath, "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await recordMigration(client, service, stem, checksum);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

interface MigrationState {
  entry: ServiceEntry;
  discovered: string[];
  applied: Map<string, string | null>;
  checksums: Map<string, string>;
}

async function inspectMigrationState(
  client: pg.Client,
  entry: ServiceEntry,
  repoRoot: string,
): Promise<MigrationState> {
  const discovered = discoverMigrations(entry.migrationsDir, repoRoot);
  const applied = await getAppliedMigrations(client, entry.name);
  const discoveredSet = new Set(discovered);

  for (const filename of applied.keys()) {
    if (!discoveredSet.has(filename)) {
      throw new Error(
        `Applied migration is missing from disk: ${entry.name}/${filename}`,
      );
    }
  }

  const checksums = new Map<string, string>();
  for (const stem of discovered) {
    if (!hasDownFile(entry.migrationsDir, repoRoot, stem)) {
      throw new Error(
        `Migration is missing its rollback file: ${entry.name}/${stem}.down.sql`,
      );
    }
    const checksum = migrationPairChecksum(entry.migrationsDir, repoRoot, stem);
    checksums.set(stem, checksum);

    const recorded = applied.get(stem);
    if (recorded !== undefined && recorded !== null && recorded !== checksum) {
      throw new Error(
        `Applied migration checksum mismatch: ${entry.name}/${stem}. ` +
          "Applied migration files are immutable; add a new migration instead.",
      );
    }
  }

  return { entry, discovered, applied, checksums };
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
    await client.query(
      "SELECT pg_advisory_lock(hashtext('owomide:migrations'))",
    );
    await ensureTrackingTable(client);

    // Validate every target before applying any pending SQL. This avoids a partial
    // multi-service rollout when a later service has migration history drift.
    const states: MigrationState[] = [];
    for (const entry of targets) {
      states.push(await inspectMigrationState(client, entry, opts.repoRoot));
    }

    if (!opts.dryRun) {
      for (const state of states) {
        for (const [stem, recorded] of state.applied) {
          if (recorded === null) {
            await backfillMigrationChecksum(
              client,
              state.entry.name,
              stem,
              state.checksums.get(stem)!,
            );
          }
        }
      }
    }

    for (const state of states) {
      const { entry, discovered, applied, checksums } = state;
      const result: ApplyResult = {
        service: entry.name,
        applied: [],
        skipped: [],
        errors: [],
      };

      if (!opts.dryRun) {
        await bootstrapServiceRole(client, entry);
      }

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
          await applyMigration(
            client,
            entry.name,
            stem,
            upPath,
            checksums.get(stem)!,
          );
          result.applied.push(stem);
        } catch (err) {
          result.errors.push({ filename: stem, error: err as Error });
          break;
        }
      }

      results.push(result);
      if (result.errors.length > 0) break;
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
    await client.query(
      "SELECT pg_advisory_lock(hashtext('owomide:migrations'))",
    );
    await ensureTrackingTable(client);

    const state = await inspectMigrationState(client, entry, opts.repoRoot);
    for (const [stem, recorded] of state.applied) {
      if (recorded === null) {
        await backfillMigrationChecksum(
          client,
          entry.name,
          stem,
          state.checksums.get(stem)!,
        );
      }
    }

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
