import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS proposal");
  await client.query(sql("0001_create_schema.up.sql"));
  await client.query(sql("0002_proposal_foundation.up.sql"));
}

describe("Proposal schema migration", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    // Create the role the migration grants to
    await superuser.query(
      "CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT"
    );
  });

  afterAll(async () => {
    await superuser.end();
    await container.stop();
  });

  it("applies 0001 + 0002 migrations cleanly", async () => {
    await expect(applyMigrations(superuser)).resolves.not.toThrow();
  });

  it("all expected tables exist after migration", async () => {
    const { rows } = await superuser.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'proposal' ORDER BY tablename`
    );
    const tables = rows.map((r) => r.tablename);
    expect(tables).toEqual(
      expect.arrayContaining([
        "change_set",
        "change_set_line",
        "outbox_event",
        "override_request",
        "proposal",
        "proposal_comment",
        "proposal_line",
        "proposal_transition",
        "scheduled_rollout",
      ])
    );
  });

  it("RLS is enabled and forced on all tables", async () => {
    const { rows } = await superuser.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'proposal' AND c.relkind = 'r'
       ORDER BY relname`
    );
    for (const row of rows) {
      expect(row.relrowsecurity, `RLS enabled on ${row.relname}`).toBe(true);
      expect(row.relforcerowsecurity, `RLS forced on ${row.relname}`).toBe(true);
    }
  });

  it("RLS isolates rows by org_id", async () => {
    // Insert a proposal as org-a
    await superuser.query("BEGIN");
    await superuser.query("SELECT set_config('app.org_id', 'org-a', true)");
    await superuser.query(
      `INSERT INTO proposal.proposal (org_id, state, actor_id, title)
       VALUES ('org-a', 'draft', 'user-1', 'Test Proposal A')`
    );
    await superuser.query("COMMIT");

    // Connect as proposal_svc and query as org-b — must see 0 rows
    const svcClient = new pg.Client({
      connectionString: container.getConnectionUri().replace("postgres:postgres@", "proposal_svc:test-password@"),
    });
    await svcClient.connect();
    try {
      await svcClient.query("BEGIN");
      await svcClient.query("SELECT set_config('app.org_id', 'org-b', true)");
      const { rows } = await svcClient.query("SELECT id FROM proposal.proposal");
      expect(rows).toHaveLength(0);
      await svcClient.query("COMMIT");

      // Same role but org-a — should see the row
      await svcClient.query("BEGIN");
      await svcClient.query("SELECT set_config('app.org_id', 'org-a', true)");
      const { rows: orgARows } = await svcClient.query("SELECT id FROM proposal.proposal");
      expect(orgARows).toHaveLength(1);
      await svcClient.query("COMMIT");
    } finally {
      await svcClient.end();
    }
  });

  it("proposal_transition is append-only (UPDATE denied to proposal_svc)", async () => {
    const svcClient = new pg.Client({
      connectionString: container.getConnectionUri().replace("postgres:postgres@", "proposal_svc:test-password@"),
    });
    await svcClient.connect();
    try {
      // Get a proposal id to reference
      await superuser.query("BEGIN");
      await superuser.query("SELECT set_config('app.org_id', 'org-a', true)");
      const proposalRows = await superuser.query<{ id: string }>(
        "SELECT id FROM proposal.proposal LIMIT 1"
      );
      const proposal = proposalRows.rows[0]!;
      await superuser.query("COMMIT");

      // Insert a transition as superuser
      await superuser.query("BEGIN");
      await superuser.query("SELECT set_config('app.org_id', 'org-a', true)");
      const transitionRows = await superuser.query<{ id: string }>(
        `INSERT INTO proposal.proposal_transition (org_id, proposal_id, from_state, to_state, actor_id)
         VALUES ('org-a', $1, NULL, 'draft', 'user-1')
         RETURNING id`,
        [proposal.id]
      );
      const transition = transitionRows.rows[0]!;
      await superuser.query("COMMIT");

      // proposal_svc should NOT be able to update it
      await svcClient.query("BEGIN");
      await svcClient.query("SELECT set_config('app.org_id', 'org-a', true)");
      await expect(
        svcClient.query(
          `UPDATE proposal.proposal_transition SET actor_id = 'attacker' WHERE id = $1`,
          [transition.id]
        )
      ).rejects.toThrow(/permission denied/);
      await svcClient.query("ROLLBACK");
    } finally {
      await svcClient.end();
    }
  });

  it("proposal_comment is append-only (UPDATE denied to proposal_svc)", async () => {
    const svcClient = new pg.Client({
      connectionString: container.getConnectionUri().replace("postgres:postgres@", "proposal_svc:test-password@"),
    });
    await svcClient.connect();
    try {
      await superuser.query("BEGIN");
      await superuser.query("SELECT set_config('app.org_id', 'org-a', true)");
      const proposalRows2 = await superuser.query<{ id: string }>(
        "SELECT id FROM proposal.proposal LIMIT 1"
      );
      const proposal2 = proposalRows2.rows[0]!;
      const commentRows = await superuser.query<{ id: string }>(
        `INSERT INTO proposal.proposal_comment (org_id, proposal_id, author_id, body)
         VALUES ('org-a', $1, 'user-1', 'Initial comment')
         RETURNING id`,
        [proposal2.id]
      );
      const comment = commentRows.rows[0]!;
      await superuser.query("COMMIT");

      await svcClient.query("BEGIN");
      await svcClient.query("SELECT set_config('app.org_id', 'org-a', true)");
      await expect(
        svcClient.query(
          `UPDATE proposal.proposal_comment SET body = 'tampered' WHERE id = $1`,
          [comment.id]
        )
      ).rejects.toThrow(/permission denied/);
      await svcClient.query("ROLLBACK");
    } finally {
      await svcClient.end();
    }
  });

  it("rollback drops all proposal tables", async () => {
    const rollbackClient = new pg.Client({ connectionString: container.getConnectionUri() });
    await rollbackClient.connect();
    try {
      await rollbackClient.query(sql("0002_proposal_foundation.down.sql"));
      const { rows } = await rollbackClient.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'proposal'`
      );
      expect(rows).toHaveLength(0);
    } finally {
      await rollbackClient.end();
    }
  });

  it("re-apply after rollback succeeds (idempotent)", async () => {
    await expect(applyMigrations(superuser)).resolves.not.toThrow();
  });
});
