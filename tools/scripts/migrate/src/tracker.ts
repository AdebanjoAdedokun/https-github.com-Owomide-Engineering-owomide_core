import type { Client } from "pg";

const DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id          SERIAL PRIMARY KEY,
    service     TEXT        NOT NULL,
    filename    TEXT        NOT NULL,
    direction   TEXT        NOT NULL,
    checksum    TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service, filename, direction)
  );
  ALTER TABLE public.schema_migrations
    ADD COLUMN IF NOT EXISTS checksum TEXT;
`;

export async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(DDL);
}

export async function getAppliedMigrations(
  client: Client,
  service: string,
): Promise<Map<string, string | null>> {
  const result = await client.query<{
    filename: string;
    checksum: string | null;
  }>(
    `SELECT filename, checksum FROM public.schema_migrations WHERE service = $1 AND direction = 'up'`,
    [service],
  );
  return new Map(result.rows.map((r) => [r.filename, r.checksum]));
}

export async function recordMigration(
  client: Client,
  service: string,
  filename: string,
  checksum: string,
): Promise<void> {
  await client.query(
    `INSERT INTO public.schema_migrations (service, filename, direction, checksum)
     VALUES ($1, $2, 'up', $3)`,
    [service, filename, checksum],
  );
}

export async function backfillMigrationChecksum(
  client: Client,
  service: string,
  filename: string,
  checksum: string,
): Promise<void> {
  const result = await client.query(
    `UPDATE public.schema_migrations
     SET checksum = $3
     WHERE service = $1 AND filename = $2 AND direction = 'up' AND checksum IS NULL`,
    [service, filename, checksum],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Could not baseline checksum for ${service}/${filename}`);
  }
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
