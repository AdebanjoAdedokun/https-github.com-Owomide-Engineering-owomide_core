import type { Client } from "pg";

const DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id          SERIAL PRIMARY KEY,
    service     TEXT        NOT NULL,
    filename    TEXT        NOT NULL,
    direction   TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service, filename, direction)
  );
`;

export async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(DDL);
}

export async function getAppliedMigrations(
  client: Client,
  service: string,
): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    `SELECT filename FROM public.schema_migrations WHERE service = $1 AND direction = 'up'`,
    [service],
  );
  return new Set(result.rows.map((r) => r.filename));
}

export async function recordMigration(
  client: Client,
  service: string,
  filename: string,
): Promise<void> {
  await client.query(
    `INSERT INTO public.schema_migrations (service, filename, direction)
     VALUES ($1, $2, 'up')
     ON CONFLICT (service, filename, direction) DO NOTHING`,
    [service, filename],
  );
}

export async function removeMigration(
  client: Client,
  service: string,
  filename: string,
): Promise<void> {
  await client.query(
    `DELETE FROM public.schema_migrations WHERE service = $1 AND filename = $2 AND direction = 'up'`,
    [service, filename],
  );
}

export async function getLastApplied(
  client: Client,
  service: string,
  steps: number,
): Promise<string[]> {
  const result = await client.query<{ filename: string }>(
    `SELECT filename FROM public.schema_migrations
     WHERE service = $1 AND direction = 'up'
     ORDER BY applied_at DESC, filename DESC
     LIMIT $2`,
    [service, steps],
  );
  return result.rows.map((r) => r.filename);
}
