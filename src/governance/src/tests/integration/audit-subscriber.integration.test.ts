import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";
import {
  ProposalSubmittedSchema,
  ProposalBlockedSchema,
  ProposalApprovedSchema,
  ProposalPublishedSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import {
  OverrideRequestedSchema,
  OverrideApprovedSchema,
} from "@owomide/proto/events/override/v1_pb.js";
import { ImportCommittedSchema } from "@owomide/proto/events/import/v1_pb.js";
import type { Event } from "@owomide/bus";
import { mapEventToAuditRow } from "../../domain/event-mapper.js";
import { insertAuditRow } from "../../repo/audit-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

function makeEvent(id: string, type: string, payload: Uint8Array): Event {
  return {
    id,
    type,
    occurredAt: "2026-07-25T10:00:00Z",
    partitionKey: "partition-1",
    payload,
  };
}

const ORG_ID = "00000000-0000-0000-0000-000000000099";
const ACTOR = "actor-test-001";

describe("audit subscriber integration", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let svcPool: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("governance_subscriber_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE governance_svc LOGIN PASSWORD 'test-password' NOINHERIT",
    );
    await superuser.query("CREATE SCHEMA IF NOT EXISTS governance");
    await superuser.query("GRANT USAGE ON SCHEMA governance TO governance_svc");
    await superuser.query(sql("0001_create_schema.up.sql"));
    await superuser.query(sql("0002_audit_log_foundation.up.sql"));

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

  async function processEvent(event: Event): Promise<boolean> {
    const row = mapEventToAuditRow(event);
    return insertAuditRow(svcPool, row);
  }

  async function getAuditRow(eventId: string) {
    const { rows } = await superuser.query(
      `SELECT org_id, event_id, event_type, entity_type, entity_id, actor_id, payload
       FROM governance.audit_log WHERE event_id = $1`,
      [eventId],
    );
    return rows[0] as {
      org_id: string;
      event_id: string;
      event_type: string;
      entity_type: string;
      entity_id: string;
      actor_id: string;
      payload: Record<string, unknown>;
    } | undefined;
  }

  it("ingests proposal.submitted", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ProposalSubmittedSchema,
      create(ProposalSubmittedSchema, {
        orgId: ORG_ID,
        proposalId: "p-001",
        changeSetId: "cs-001",
        actorId: ACTOR,
      }),
    );
    await processEvent(makeEvent(eventId, "proposal.submitted", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.org_id).toBe(ORG_ID);
    expect(row!.entity_type).toBe("proposal");
    expect(row!.entity_id).toBe("p-001");
    expect(row!.actor_id).toBe(ACTOR);
    expect(row!.event_type).toBe("proposal.submitted");
  });

  it("ingests proposal.blocked", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ProposalBlockedSchema,
      create(ProposalBlockedSchema, {
        orgId: ORG_ID,
        proposalId: "p-002",
        actorId: ACTOR,
      }),
    );
    await processEvent(makeEvent(eventId, "proposal.blocked", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("proposal");
    expect(row!.entity_id).toBe("p-002");
  });

  it("ingests proposal.approved — actor is the approver", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ProposalApprovedSchema,
      create(ProposalApprovedSchema, {
        orgId: ORG_ID,
        proposalId: "p-003",
        approverId: "approver-001",
        actorId: "proposal-creator",
      }),
    );
    await processEvent(makeEvent(eventId, "proposal.approved", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("proposal");
    expect(row!.actor_id).toBe("approver-001");
  });

  it("ingests proposal.published", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ProposalPublishedSchema,
      create(ProposalPublishedSchema, {
        orgId: ORG_ID,
        proposalId: "p-004",
        actorId: ACTOR,
      }),
    );
    await processEvent(makeEvent(eventId, "proposal.published", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("proposal");
  });

  it("ingests override.requested", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      OverrideRequestedSchema,
      create(OverrideRequestedSchema, {
        orgId: ORG_ID,
        proposalId: "p-005",
        overrideRequestId: "or-001",
        actorId: ACTOR,
        justification: "market pressure",
      }),
    );
    await processEvent(makeEvent(eventId, "override.requested", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("override");
    expect(row!.entity_id).toBe("or-001");
    expect(row!.actor_id).toBe(ACTOR);
  });

  it("ingests override.approved", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      OverrideApprovedSchema,
      create(OverrideApprovedSchema, {
        orgId: ORG_ID,
        proposalId: "p-005",
        overrideRequestId: "or-002",
        approverId: "approver-002",
        requesterId: ACTOR,
      }),
    );
    await processEvent(makeEvent(eventId, "override.approved", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("override");
    expect(row!.entity_id).toBe("or-002");
    expect(row!.actor_id).toBe("approver-002");
  });

  it("ingests import.committed", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ImportCommittedSchema,
      create(ImportCommittedSchema, {
        orgId: ORG_ID,
        batchId: "batch-001",
        fileUrl: "s3://bucket/file.csv",
        actorId: ACTOR,
        templateId: "tpl-001",
      }),
    );
    await processEvent(makeEvent(eventId, "import.committed", payload));
    const row = await getAuditRow(eventId);
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe("import");
    expect(row!.entity_id).toBe("batch-001");
    expect(row!.actor_id).toBe(ACTOR);
  });

  it("duplicate event_id produces only one row", async () => {
    const eventId = crypto.randomUUID();
    const payload = toBinary(
      ProposalSubmittedSchema,
      create(ProposalSubmittedSchema, {
        orgId: ORG_ID,
        proposalId: "p-dup",
        changeSetId: "cs-dup",
        actorId: ACTOR,
      }),
    );
    const event = makeEvent(eventId, "proposal.submitted", payload);
    const first = await processEvent(event);
    const second = await processEvent(event);
    expect(first).toBe(true);
    expect(second).toBe(false);

    const { rows } = await superuser.query(
      "SELECT count(*)::int AS cnt FROM governance.audit_log WHERE event_id = $1",
      [eventId],
    );
    expect(rows[0].cnt).toBe(1);
  });

  it("all rows are scoped by org_id", async () => {
    const { rows } = await superuser.query(
      "SELECT DISTINCT org_id FROM governance.audit_log",
    );
    expect(rows.every((r: { org_id: string }) => r.org_id === ORG_ID)).toBe(true);
  });
});
