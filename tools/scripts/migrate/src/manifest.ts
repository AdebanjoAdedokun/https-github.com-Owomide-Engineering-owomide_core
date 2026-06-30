import { readFileSync } from "node:fs";
import { load } from "js-yaml";

export interface ServiceEntry {
  name: string;
  role: string;
  schema: string;
  migrationsDir: string;
}

interface RawManifest {
  services: Array<{
    name: string;
    role: string;
    schema: string;
    migrations_dir: string;
  }>;
}

export function loadManifest(manifestPath: string): ServiceEntry[] {
  const raw = load(readFileSync(manifestPath, "utf8")) as RawManifest;

  if (!Array.isArray(raw?.services)) {
    throw new Error(`Invalid manifest at ${manifestPath}: missing 'services' array`);
  }

  return raw.services.map((entry, idx) => {
    for (const field of ["name", "role", "schema", "migrations_dir"] as const) {
      if (!entry[field]) {
        throw new Error(
          `Invalid manifest: services[${idx}] is missing required field '${field}'`,
        );
      }
    }
    return {
      name: entry.name,
      role: entry.role,
      schema: entry.schema,
      migrationsDir: entry.migrations_dir,
    };
  });
}

export function filterToService(services: ServiceEntry[], name: string): ServiceEntry {
  const found = services.find((s) => s.name === name);
  if (!found) {
    const valid = services.map((s) => s.name).join(", ");
    throw new Error(`Unknown service '${name}'. Valid services: ${valid}`);
  }
  return found;
}
