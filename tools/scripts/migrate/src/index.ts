import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { requireEnv } from "./env.js";
import { runMigrations, runDown, type ApplyResult, type DownResult } from "./runner.js";
import { createMigrationFiles } from "./sql-files.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const DEFAULT_MANIFEST = resolve(REPO_ROOT, "infra/db/roles.yaml");

function printApplyResults(results: ApplyResult[]): void {
  let hasErrors = false;
  for (const r of results) {
    if (r.applied.length > 0) {
      console.log(`[${r.service}] applied: ${r.applied.join(", ")}`);
    }
    if (r.skipped.length > 0) {
      console.log(`[${r.service}] skipped (already applied): ${r.skipped.join(", ")}`);
    }
    if (r.applied.length === 0 && r.skipped.length === 0) {
      console.log(`[${r.service}] nothing to apply`);
    }
    for (const e of r.errors) {
      console.error(`[${r.service}] ERROR applying ${e.filename}: ${e.error.message}`);
      hasErrors = true;
    }
  }
  if (hasErrors) process.exit(1);
}

function printDownResults(results: DownResult[]): void {
  let hasErrors = false;
  for (const r of results) {
    if (r.rolledBack.length > 0) {
      console.log(`[${r.service}] rolled back: ${r.rolledBack.join(", ")}`);
    }
    for (const e of r.errors) {
      console.error(`[${r.service}] ERROR reverting ${e.filename}: ${e.error.message}`);
      hasErrors = true;
    }
  }
  if (hasErrors) process.exit(1);
}

await yargs(hideBin(process.argv))
  .scriptName("migrate")
  .usage("$0 <command> [options]")
  .command(
    ["apply", "$0"],
    "Apply pending migrations",
    (y) =>
      y
        .option("svc", { type: "string", describe: "Run for one service only" })
        .option("manifest", { type: "string", describe: "Path to roles.yaml", default: DEFAULT_MANIFEST })
        .option("dry-run", { type: "boolean", describe: "Print pending without applying", default: false }),
    async (argv) => {
      const databaseUrl = requireEnv("DATABASE_URL");
      const results = await runMigrations({
        databaseUrl,
        manifestPath: argv.manifest,
        repoRoot: REPO_ROOT,
        service: argv.svc,
        dryRun: argv["dry-run"],
      });
      printApplyResults(results);
    },
  )
  .command(
    "down",
    "Roll back the last N applied migrations for a service",
    (y) =>
      y
        .option("svc", { type: "string", describe: "Service name (required)", demandOption: true })
        .option("steps", { type: "number", describe: "Number of migrations to roll back", default: 1 })
        .option("manifest", { type: "string", describe: "Path to roles.yaml", default: DEFAULT_MANIFEST }),
    async (argv) => {
      const databaseUrl = requireEnv("DATABASE_URL");
      const results = await runDown({
        databaseUrl,
        manifestPath: argv.manifest,
        repoRoot: REPO_ROOT,
        service: argv.svc,
        steps: argv.steps,
      });
      printDownResults(results);
    },
  )
  .command(
    "create",
    "Scaffold a new paired .up.sql + .down.sql migration file",
    (y) =>
      y
        .option("svc", { type: "string", describe: "Service name (required)", demandOption: true })
        .option("name", { type: "string", describe: "Migration description (required)", demandOption: true })
        .option("manifest", { type: "string", describe: "Path to roles.yaml", default: DEFAULT_MANIFEST }),
    async (argv) => {
      const { loadManifest, filterToService } = await import("./manifest.js");
      const services = loadManifest(argv.manifest);
      const entry = filterToService(services, argv.svc);

      const { up, down } = createMigrationFiles(
        entry.migrationsDir,
        REPO_ROOT,
        entry.name,
        argv.name,
      );
      console.log(`Created: ${up}`);
      console.log(`Created: ${down}`);
    },
  )
  .demandCommand(1, "Please provide a command: apply, down, or create")
  .strict()
  .help()
  .parseAsync();
