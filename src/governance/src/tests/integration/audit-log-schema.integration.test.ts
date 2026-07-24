import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS governance");
  await client.query("GRANT USAGE ON SCHEMA governance TO governance_svc");
  await client.query(sql("0001_create_schema.up.sql"));
  await client.query(sql("0002_audit_log_foundation.up.sql"));
}

const ORG_ID = "00000000-0000-0000-0000-000000000099";

describe("audit_log schema", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let svcPool: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("governance_schema_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE governance_svc LOGIN PASSWORD 'test-password' NOINHERIT",
    );
    await applyMigrations(superuser);

    svcPool = new pg.Pool({
      connectionString: container
        .getConnectionUri()
        .replace("postgres:postgres@", "governance_svc:test-password@"),
      max: 2,
    });
  }, 120_000);

  afterAll(async () => {
    await svcPool.end();
    await superuser.end();
    await container.stop();
  });

  it("inserts a valid audit row and reads it back", async () => {
    const eventId = crypto.randomUUID();
    await superuser.query(
      `INSERT INTO governance.audit_log
         (org_id, event_id, event_type, entity_type, entity_id, actor_id, occurred_at, payload)
       VALUES ($1, $2, 'proposal.submitted', 'proposal', $3, $4, now(), '{"title":"Test"}'::jsonb)`,
      [ORG_ID, eventId, crypto.randomUUID(), crypto.randomUUID()],
    );

    const { rows } = await superuser.query<{
      org_id: string;
      event_id: string;
      event_type: string;
      entity_type: string;
    }>(
      "SELECT org_id, event_id, event_type, entity_type FROM governance.audit_log WHERE event_id = $1",
      [eventId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.org_id).toBe(ORG_ID);
    expect(rows[0]!.event_type).toBe("proposal.submitted");
    expect(rows[0]!.entity_type).toBe("proposal");
  });

  it("rejects duplicate event_id (idempotency)", async () => {
    const eventId = crypto.randomUUID();
    const insert = `INSERT INTO governance.audit_log
      (org_id, event_id, event_type, entity_type, entity_id, actor_id, occurred_at, payload)
      VALUES ($1, $2, 'proposal.approved', 'proposal', $3, $4, now(), '{}'::jsonb)`;
    const params = [ORG_ID, eventId, crypto.randomUUID(), crypto.randomUUID()];

    await superuser.query(insert, params);

    try {
      await superuser.query(insert, params);
      expect.unreachable("should have thrown unique violation");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("23505");
    }
  });

  it("governance_svc cannot UPDATE audit_log rows", async () => {
    const eventId = crypto.randomUUID();
    const rowId = crypto.randomUUID();
    await superuser.query(
      `INSERT INTO governance.audit_log
         (id, org_id, event_id, event_type, entity_type, entity_id, actor_id, occurred_at, payload)
       VALUES ($1, $2, $3, 'override.requested', 'override', $4, $5, now(), '{}'::jsonb)`,
      [rowId, ORG_ID, eventId, crypto.randomUUID(), crypto.randomUUID()],
    );

    const svc = await svcPool.connect();
    try {
      await svc.query(`SET LOCAL app.org_id = '${ORG_ID}'`);
      await svc.query(
        "UPDATE governance.audit_log SET actor_id = 'tampered' WHERE id = $1",
        [rowId],
      );
      expect.unreachable("should have thrown permission denied");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("42501");
    } finally {
      svc.release();
    }
  });

  it("governance_svc cannot DELETE audit_log rows", async () => {
    const eventId = crypto.randomUUID();
    const rowId = crypto.randomUUID();
    await superuser.query(
      `INSERT INTO governance.audit_log
         (id, org_id, event_id, event_type, entity_type, entity_id, actor_id, occurred_at, payload)
       VALUES ($1, $2, $3, 'import.committed', 'import', $4, $5, now(), '{}'::jsonb)`,
      [rowId, ORG_ID, eventId, crypto.randomUUID(), crypto.randomUUID()],
    );

    const svc = await svcPool.connect();
    try {
      await svc.query(`SET LOCAL app.org_id = '${ORG_ID}'`);
      await svc.query(
        "DELETE FROM governance.audit_log WHERE id = $1",
        [rowId],
      );
      expect.unreachable("should have thrown permission denied");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("42501");
    } finally {
      svc.release();
    }
  });
});
