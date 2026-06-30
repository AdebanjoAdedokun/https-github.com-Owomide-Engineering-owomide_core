import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadManifest, filterToService } from "../../manifest.js";

const VALID_YAML = `
services:
  - name: catalog
    role: catalog_svc
    schema: catalog
    migrations_dir: src/catalog/migrations
  - name: proposal
    role: proposal_svc
    schema: proposal
    migrations_dir: src/proposal/migrations
`;

function writeTempManifest(content: string): { path: string; dir: string } {
  const dir = join(tmpdir(), `manifest-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "roles.yaml");
  writeFileSync(path, content);
  return { path, dir };
}

describe("loadManifest", () => {
  let dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs = [];
  });

  it("parses a valid manifest into ServiceEntry[]", () => {
    const { path, dir } = writeTempManifest(VALID_YAML);
    dirs.push(dir);

    const services = loadManifest(path);
    expect(services).toHaveLength(2);
    expect(services[0]).toEqual({
      name: "catalog",
      role: "catalog_svc",
      schema: "catalog",
      migrationsDir: "src/catalog/migrations",
    });
  });

  it("throws when 'services' array is missing", () => {
    const { path, dir } = writeTempManifest("other: value\n");
    dirs.push(dir);
    expect(() => loadManifest(path)).toThrow(/missing 'services' array/);
  });

  it("throws with field name when a required field is missing", () => {
    const { path, dir } = writeTempManifest(`
services:
  - name: catalog
    schema: catalog
    migrations_dir: src/catalog/migrations
`);
    dirs.push(dir);
    expect(() => loadManifest(path)).toThrow(/missing required field 'role'/);
  });

  it("throws with index when a required field is missing on second entry", () => {
    const { path, dir } = writeTempManifest(`
services:
  - name: catalog
    role: catalog_svc
    schema: catalog
    migrations_dir: src/catalog/migrations
  - name: proposal
    role: proposal_svc
    schema: proposal
`);
    dirs.push(dir);
    expect(() => loadManifest(path)).toThrow(/services\[1\]/);
  });

  it("accepts an empty services array", () => {
    const { path, dir } = writeTempManifest("services: []\n");
    dirs.push(dir);
    expect(loadManifest(path)).toEqual([]);
  });
});

describe("filterToService", () => {
  const services = [
    { name: "catalog", role: "catalog_svc", schema: "catalog", migrationsDir: "src/catalog/migrations" },
    { name: "proposal", role: "proposal_svc", schema: "proposal", migrationsDir: "src/proposal/migrations" },
  ];

  it("returns the matching entry", () => {
    const result = filterToService(services, "catalog");
    expect(result.name).toBe("catalog");
  });

  it("throws with a list of valid names when not found", () => {
    expect(() => filterToService(services, "nonexistent")).toThrow(
      /catalog, proposal/,
    );
  });
});
