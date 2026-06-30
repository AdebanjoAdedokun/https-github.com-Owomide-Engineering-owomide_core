import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const UP_RE = /^(\d{4}_[^.]+)\.up\.sql$/;
const DOWN_RE = /^(\d{4}_[^.]+)\.down\.sql$/;

/** Returns sorted list of migration stems (e.g. '0001_create_schema') that have an .up.sql file. */
export function discoverMigrations(migrationsDir: string, repoRoot: string): string[] {
  const dir = resolve(repoRoot, migrationsDir);
  if (!existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const files = readdirSync(dir);
  const stems: string[] = [];

  for (const file of files) {
    const m = UP_RE.exec(file);
    if (m?.[1]) stems.push(m[1]);
  }

  return stems.sort();
}

/** Returns the absolute path to an .up.sql or .down.sql file. */
export function migrationPath(
  migrationsDir: string,
  repoRoot: string,
  stem: string,
  direction: "up" | "down",
): string {
  return resolve(repoRoot, migrationsDir, `${stem}.${direction}.sql`);
}

/** Finds the next sequence number by scanning existing .up.sql files. */
export function nextSequenceNumber(migrationsDir: string, repoRoot: string): number {
  const dir = resolve(repoRoot, migrationsDir);
  if (!existsSync(dir)) return 1;

  const files = readdirSync(dir);
  let max = 0;

  for (const file of files) {
    const m = UP_RE.exec(file);
    if (m?.[1]) {
      const n = parseInt(m[1].slice(0, 4), 10);
      if (n > max) max = n;
    }
  }

  return max + 1;
}

/** Checks whether a matching .down.sql exists for a given stem. */
export function hasDownFile(migrationsDir: string, repoRoot: string, stem: string): boolean {
  const dir = resolve(repoRoot, migrationsDir);
  const files = readdirSync(dir);
  return files.some((f) => DOWN_RE.exec(f)?.[1] === stem);
}

const MIGRATION_HEADER = (stem: string, service: string, direction: "up" | "down") =>
  direction === "up"
    ? `-- Migration: ${stem}\n-- Service: ${service}\n-- Created: ${new Date().toISOString().slice(0, 10)}\n\n-- Write your SQL here\n`
    : `-- Rollback: ${stem}\n-- Service: ${service}\n-- Created: ${new Date().toISOString().slice(0, 10)}\n\n-- Write the reverse SQL here\n`;

/** Scaffolds a new paired .up.sql + .down.sql and returns their paths. */
export function createMigrationFiles(
  migrationsDir: string,
  repoRoot: string,
  service: string,
  name: string,
): { up: string; down: string } {
  const dir = resolve(repoRoot, migrationsDir);
  mkdirSync(dir, { recursive: true });

  const seq = nextSequenceNumber(migrationsDir, repoRoot).toString().padStart(4, "0");
  const stem = `${seq}_${name.replace(/\s+/g, "_")}`;

  const upPath = join(dir, `${stem}.up.sql`);
  const downPath = join(dir, `${stem}.down.sql`);

  writeFileSync(upPath, MIGRATION_HEADER(stem, service, "up"));
  writeFileSync(downPath, MIGRATION_HEADER(stem, service, "down"));

  return { up: upPath, down: downPath };
}
