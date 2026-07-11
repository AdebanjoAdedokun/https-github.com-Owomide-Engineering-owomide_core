import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverMigrations,
  nextSequenceNumber,
  hasDownFile,
  createMigrationFiles,
  migrationChecksum,
  migrationPairChecksum,
  migrationPath,
} from "../../sql-files.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `migrate-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("discoverMigrations", () => {
  let repoRoot: string;
  let migrationsDir: string;

  beforeEach(() => {
    repoRoot = makeTempDir();
    migrationsDir = "migrations";
    mkdirSync(join(repoRoot, migrationsDir), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns stems in sorted order", () => {
    writeFileSync(join(repoRoot, migrationsDir, "0003_c.up.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.up.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0002_b.up.sql"), "");

    const result = discoverMigrations(migrationsDir, repoRoot);
    expect(result).toEqual(["0001_a", "0002_b", "0003_c"]);
  });

  it("excludes non-.sql files and .down.sql files", () => {
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.up.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.down.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "README.md"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0002_b.down.sql"), "");

    const result = discoverMigrations(migrationsDir, repoRoot);
    expect(result).toEqual(["0001_a"]);
  });

  it("returns empty array when no .up.sql files exist", () => {
    const result = discoverMigrations(migrationsDir, repoRoot);
    expect(result).toEqual([]);
  });

  it("throws when directory does not exist", () => {
    expect(() => discoverMigrations("nonexistent", repoRoot)).toThrow(
      /Migrations directory not found/,
    );
  });
});

describe("nextSequenceNumber", () => {
  let repoRoot: string;
  let migrationsDir: string;

  beforeEach(() => {
    repoRoot = makeTempDir();
    migrationsDir = "migrations";
    mkdirSync(join(repoRoot, migrationsDir), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns 1 when no files exist", () => {
    expect(nextSequenceNumber(migrationsDir, repoRoot)).toBe(1);
  });

  it("returns max + 1", () => {
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.up.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0003_c.up.sql"), "");
    expect(nextSequenceNumber(migrationsDir, repoRoot)).toBe(4);
  });
});

describe("hasDownFile", () => {
  let repoRoot: string;
  let migrationsDir: string;

  beforeEach(() => {
    repoRoot = makeTempDir();
    migrationsDir = "migrations";
    mkdirSync(join(repoRoot, migrationsDir), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns true when .down.sql exists", () => {
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.down.sql"), "");
    expect(hasDownFile(migrationsDir, repoRoot, "0001_a")).toBe(true);
  });

  it("returns false when .down.sql is absent", () => {
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.up.sql"), "");
    expect(hasDownFile(migrationsDir, repoRoot, "0001_a")).toBe(false);
  });
});

describe("createMigrationFiles", () => {
  let repoRoot: string;
  let migrationsDir: string;

  beforeEach(() => {
    repoRoot = makeTempDir();
    migrationsDir = "migrations";
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("creates both .up.sql and .down.sql with correct sequence number", () => {
    const { up, down } = createMigrationFiles(
      migrationsDir,
      repoRoot,
      "catalog",
      "add_products",
    );
    expect(up).toMatch(/0001_add_products\.up\.sql$/);
    expect(down).toMatch(/0001_add_products\.down\.sql$/);
  });

  it("increments sequence correctly when files already exist", () => {
    mkdirSync(join(repoRoot, migrationsDir), { recursive: true });
    writeFileSync(join(repoRoot, migrationsDir, "0001_a.up.sql"), "");
    writeFileSync(join(repoRoot, migrationsDir, "0002_b.up.sql"), "");

    const { up } = createMigrationFiles(
      migrationsDir,
      repoRoot,
      "catalog",
      "next",
    );
    expect(up).toMatch(/0003_next\.up\.sql$/);
  });

  it("replaces spaces with underscores in name", () => {
    const { up } = createMigrationFiles(
      migrationsDir,
      repoRoot,
      "catalog",
      "add products table",
    );
    expect(up).toMatch(/0001_add_products_table\.up\.sql$/);
  });

  it("creates the migrations directory if it does not exist", () => {
    expect(() =>
      createMigrationFiles(
        "brand-new-dir/migrations",
        repoRoot,
        "catalog",
        "init",
      ),
    ).not.toThrow();
  });
});

describe("migrationPath", () => {
  it("returns path with correct extension for up", () => {
    const result = migrationPath(
      "src/catalog/migrations",
      "/repo",
      "0001_a",
      "up",
    );
    expect(result).toMatch(/0001_a\.up\.sql$/);
  });

  it("returns path with correct extension for down", () => {
    const result = migrationPath(
      "src/catalog/migrations",
      "/repo",
      "0001_a",
      "down",
    );
    expect(result).toMatch(/0001_a\.down\.sql$/);
  });
});

describe("migrationChecksum", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = makeTempDir();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("changes when the exact migration bytes change", () => {
    const path = join(repoRoot, "0001_test.up.sql");
    writeFileSync(path, "SELECT 1;\n");
    const original = migrationChecksum(path);

    writeFileSync(path, "SELECT 1; -- changed\n");

    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationChecksum(path)).not.toBe(original);
  });
});

describe("migrationPairChecksum", () => {
  let repoRoot: string;
  const migrationsDir = "migrations";

  beforeEach(() => {
    repoRoot = makeTempDir();
    mkdirSync(join(repoRoot, migrationsDir));
    writeFileSync(
      join(repoRoot, migrationsDir, "0001_test.up.sql"),
      "SELECT 1;\n",
    );
    writeFileSync(
      join(repoRoot, migrationsDir, "0001_test.down.sql"),
      "SELECT 2;\n",
    );
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("changes when the rollback file changes", () => {
    const original = migrationPairChecksum(
      migrationsDir,
      repoRoot,
      "0001_test",
    );
    writeFileSync(
      join(repoRoot, migrationsDir, "0001_test.down.sql"),
      "SELECT 3;\n",
    );

    expect(
      migrationPairChecksum(migrationsDir, repoRoot, "0001_test"),
    ).not.toBe(original);
  });
});
