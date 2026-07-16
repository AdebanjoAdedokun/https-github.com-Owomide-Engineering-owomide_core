import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Event, Publisher } from "@owomide/bus";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { OutboxRelay } from "../../workers/outbox-relay.js";

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

class MockPublisher implements Publisher {
  readonly calls: Array<{ topic: string; event: Event }> = [];
  shouldFail = false;

  async publish(topic: string, event: Event): Promise<void> {
    if (this.shouldFail) throw new Error("kafka unavailable");
    this.calls.push({ topic, event });
  }

  async close(): Promise<void> {}
}

const logger = pino({ level: "silent" });

describe("OutboxRelay", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;

  const ORG_A = "00000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("outbox_relay_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT"
    );
    await applyMigrations(superuser);

    db = new Database({
      databaseUrl: container
        .getConnectionUri()
        .replace("postgres:postgres@", "proposal_svc:test-password@"),
      databasePoolSize: 5,
      databaseStatementTimeoutMs: 15_000,
    });
    repo = new ProposalRepository();
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  async function insertOutboxRow(eventType: string, aggregateId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.withOrgTransaction(ORG_A, (c) =>
      repo.insertOutboxEvent(c, {
        id,
        orgId: ORG_A,
        eventType,
        aggregateId,
        partitionKey: aggregateId,
        payload: new Uint8Array([0x08, 0x01]),
      })
    );
    return id;
  }

  it("publishes a pending outbox event and marks it published", async () => {
    const aggregateId = crypto.randomUUID();
    const outboxId = await insertOutboxRow("proposal.submitted", aggregateId);

    const publisher = new MockPublisher();
    const relay = new OutboxRelay(db.pool, publisher, logger);
    await relay.runOnce();

    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0]!.topic).toBe("proposal.submitted");
    expect(publisher.calls[0]!.event.id).toBe(outboxId);
    expect(publisher.calls[0]!.event.type).toBe("proposal.submitted");
    expect(publisher.calls[0]!.event.partitionKey).toBe(aggregateId);

    const { rows } = await superuser.query(
      `SELECT published_at FROM proposal.outbox_event WHERE id = $1`,
      [outboxId]
    );
    expect(rows[0]!.published_at).not.toBeNull();
  });

  it("sets last_error and leaves published_at null when publisher throws", async () => {
    const aggregateId = crypto.randomUUID();
    const outboxId = await insertOutboxRow("proposal.submitted", aggregateId);

    const publisher = new MockPublisher();
    publisher.shouldFail = true;
    const relay = new OutboxRelay(db.pool, publisher, logger);
    await relay.runOnce();

    const { rows } = await superuser.query(
      `SELECT published_at, last_error FROM proposal.outbox_event WHERE id = $1`,
      [outboxId]
    );
    expect(rows[0]!.published_at).toBeNull();
    expect(rows[0]!.last_error).toBe("kafka unavailable");
  });

  it("does not re-publish an already-published event", async () => {
    const aggregateId = crypto.randomUUID();
    const outboxId = await insertOutboxRow("proposal.submitted", aggregateId);

    const publisher = new MockPublisher();
    const relay = new OutboxRelay(db.pool, publisher, logger);

    await relay.runOnce();
    expect(publisher.calls).toHaveLength(1);

    publisher.calls.length = 0;
    await relay.runOnce();
    expect(publisher.calls).toHaveLength(0);

    const { rows } = await superuser.query(
      `SELECT COUNT(*) AS c FROM proposal.outbox_event WHERE id = $1 AND published_at IS NOT NULL`,
      [outboxId]
    );
    expect(Number(rows[0]!.c)).toBe(1);
  });

  it("relays proposal.blocked events with correct topic", async () => {
    const aggregateId = crypto.randomUUID();
    const outboxId = await insertOutboxRow("proposal.blocked", aggregateId);

    const publisher = new MockPublisher();
    const relay = new OutboxRelay(db.pool, publisher, logger);
    await relay.runOnce();

    expect(publisher.calls[0]!.topic).toBe("proposal.blocked");
    expect(publisher.calls[0]!.event.id).toBe(outboxId);
  });
});
