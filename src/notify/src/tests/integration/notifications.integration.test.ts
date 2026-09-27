import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create, toBinary } from "@bufbuild/protobuf";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ProposalApprovedSchema,
  ProposalPublishedSchema,
  ProposalSubmittedSchema,
} from "@owomide/proto/events/proposal/v1_pb.js";
import { ImportCommittedSchema } from "@owomide/proto/events/import/v1_pb.js";
import { Database } from "../../db.js";
import type { RecipientDirectory } from "../../domain/routing.js";
import { handleEvent } from "../../handlers/event-handler.js";
import {
  listInbox,
  markRead,
  setPreference,
  unreadCount,
} from "../../repo/notification-repo.js";

// Migration 0002 and the event handler, end to end against PostgreSQL as notify_svc. Runs against
// a disposable container, or against NOTIFY_TEST_DATABASE_URL (a superuser URL for an empty
// database) where containers are unavailable.

const MIGRATIONS = ["0001_create_schema.up.sql", "0002_notifications.up.sql"];
const sql = (f: string) =>
  readFileSync(resolve(process.cwd(), "migrations", f), "utf8");
const ORG = "org-lagos";
const OTHER = "org-other";
const PROPOSAL = "7f1d3c2a-0000-4000-8000-000000000001";

const people: Record<string, { email?: string; permissions: string[] }> = {
  ada: { email: "ada@example.test", permissions: ["proposal.submit"] },
  tunde: { email: "tunde@example.test", permissions: ["approval.approve"] },
  bisi: { permissions: ["approval.approve"] }, // no email address on file
  emeka: {
    email: "emeka@example.test",
    permissions: ["execution.mark_implemented"],
  },
};

const directory: RecipientDirectory = {
  usersWithPermission: async (_org, permission) =>
    Object.entries(people)
      .filter(([, p]) => p.permissions.includes(permission))
      .map(([id]) => id),
  emailAddresses: async (_org, ids) =>
    new Map(
      ids.flatMap((id) =>
        people[id]?.email ? [[id, people[id]!.email!] as [string, string]] : [],
      ),
    ),
};

describe("Notify: notifications, preferences and email queue", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let db: Database;
  const deps = () => ({
    db,
    directory,
    appBaseUrl: "https://app.example.test",
  });

  beforeAll(async () => {
    let adminUrl = process.env.NOTIFY_TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("notify_test")
        .start();
      adminUrl = container.getConnectionUri();
    }
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      "DO $$ BEGIN CREATE ROLE notify_svc LOGIN PASSWORD 'notify_test'; " +
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    );
    await admin.query("CREATE SCHEMA notify");
    await admin.query("GRANT USAGE ON SCHEMA notify TO notify_svc");
    for (const f of MIGRATIONS) await admin.query(sql(f));
    const url = new URL(adminUrl);
    url.username = "notify_svc";
    url.password = "notify_test";
    db = new Database(url.toString(), 4);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    await admin?.end();
    await container?.stop();
  }, 120_000);

  const submitted = (id: string, actor = "ada") => ({
    id,
    type: "proposal.submitted",
    payload: toBinary(
      ProposalSubmittedSchema,
      create(ProposalSubmittedSchema, {
        orgId: ORG,
        proposalId: PROPOSAL,
        actorId: actor,
      }),
    ),
  });

  const rows = (org: string, q: string, values: unknown[] = []) =>
    db.withOrgTransaction(org, async (c) => (await c.query(q, values)).rows);

  it("notifies approvers of a submission once, even when the event is delivered twice", async () => {
    const first = await handleEvent(submitted("evt-sub-1"), deps());
    expect(first).toEqual({ recipients: 2, created: 2 });
    const replay = await handleEvent(submitted("evt-sub-1"), deps());
    expect(replay).toEqual({ recipients: 2, created: 0 });

    const stored = await rows(
      ORG,
      `SELECT n.recipient_user_id, n.title, n.link_path, e.recipient_email
       FROM notify.notification n LEFT JOIN notify.email_delivery e ON e.notification_id = n.id
       ORDER BY n.recipient_user_id`,
    );
    expect(stored).toEqual([
      // Bisi has no email address, so only the in-app notification exists.
      {
        recipient_user_id: "bisi",
        title: "A proposal needs your review",
        link_path: `/proposals/${PROPOSAL}`,
        recipient_email: null,
      },
      {
        recipient_user_id: "tunde",
        title: "A proposal needs your review",
        link_path: `/proposals/${PROPOSAL}`,
        recipient_email: "tunde@example.test",
      },
    ]);
    const participant = await rows(
      ORG,
      `SELECT submitter_user_id, approver_user_id FROM notify.proposal_participant`,
    );
    expect(participant).toEqual([
      { submitter_user_id: "ada", approver_user_id: null },
    ]);
  });

  it("tells the submitter about the approval and everyone involved about the release", async () => {
    await handleEvent(
      {
        id: "evt-appr-1",
        type: "proposal.approved",
        payload: toBinary(
          ProposalApprovedSchema,
          create(ProposalApprovedSchema, {
            orgId: ORG,
            proposalId: PROPOSAL,
            approverId: "tunde",
            actorId: "tunde",
          }),
        ),
      },
      deps(),
    );
    await handleEvent(
      {
        id: "evt-pub-1",
        type: "proposal.published",
        payload: toBinary(
          ProposalPublishedSchema,
          create(ProposalPublishedSchema, {
            orgId: ORG,
            proposalId: PROPOSAL,
            actorId: "femi",
          }),
        ),
      },
      deps(),
    );
    const byEvent = await rows(
      ORG,
      `SELECT source_event_id, array_agg(recipient_user_id ORDER BY recipient_user_id) AS who
       FROM notify.notification WHERE source_event_id IN ('evt-appr-1', 'evt-pub-1')
       GROUP BY source_event_id ORDER BY source_event_id`,
    );
    expect(byEvent).toEqual([
      { source_event_id: "evt-appr-1", who: ["ada"] },
      { source_event_id: "evt-pub-1", who: ["ada", "emeka", "tunde"] },
    ]);
  });

  it("honours opt-outs, except for requests that need someone to act", async () => {
    await db.withOrgTransaction(ORG, async (c) => {
      await setPreference(c, ORG, "tunde", "proposal.submitted", {
        emailEnabled: false,
        inAppEnabled: false,
      });
      await setPreference(c, ORG, "ada", "import.committed", {
        emailEnabled: true,
        inAppEnabled: false,
      });
    });
    await handleEvent(submitted("evt-sub-2"), deps());
    const tunde = await rows(
      ORG,
      `SELECT n.show_in_app, e.id IS NOT NULL AS emailed FROM notify.notification n
       LEFT JOIN notify.email_delivery e ON e.notification_id = n.id
       WHERE n.source_event_id = 'evt-sub-2' AND n.recipient_user_id = 'tunde'`,
    );
    expect(tunde).toEqual([{ show_in_app: true, emailed: false }]);

    await handleEvent(
      {
        id: "evt-imp-1",
        type: "import.committed",
        payload: toBinary(
          ImportCommittedSchema,
          create(ImportCommittedSchema, {
            orgId: ORG,
            batchId: "b-1",
            actorId: "ada",
            rowCounts: { ok: 120, warned: 0, excluded: 0, errored: 8 },
          }),
        ),
      },
      deps(),
    );
    const ada = await rows(
      ORG,
      `SELECT n.show_in_app, n.body, e.subject FROM notify.notification n
       JOIN notify.email_delivery e ON e.notification_id = n.id WHERE n.source_event_id = 'evt-imp-1'`,
    );
    expect(ada).toEqual([
      {
        show_in_app: false,
        body: "120 rows were saved, 8 rows were rejected with reasons.",
        subject: "Owómidé: Your import is complete",
      },
    ]);
  });

  it("lists only the reader's own inbox and marks only their own notifications read", async () => {
    const inbox = await db.withOrgTransaction(ORG, (c) =>
      listInbox(c, "tunde", 10),
    );
    // Newest first: the second submission, the release, then the first submission.
    expect(inbox.map((i) => i.eventType)).toEqual([
      "proposal.submitted",
      "proposal.published",
      "proposal.submitted",
    ]);
    const adaInbox = await db.withOrgTransaction(ORG, (c) =>
      listInbox(c, "ada", 10),
    );
    // Ada's import notification was email-only, so it is not in her inbox.
    expect(adaInbox.map((i) => i.eventType)).toEqual([
      "proposal.published",
      "proposal.approved",
    ]);

    const marked = await db.withOrgTransaction(ORG, (c) =>
      markRead(c, "tunde", [...inbox.map((i) => i.id), adaInbox[0]!.id]),
    );
    expect(marked).toBe(3);
    expect(
      await db.withOrgTransaction(ORG, (c) => unreadCount(c, "tunde")),
    ).toBe(0);
    expect(await db.withOrgTransaction(ORG, (c) => unreadCount(c, "ada"))).toBe(
      2,
    );

    const page2 = await db.withOrgTransaction(ORG, (c) =>
      listInbox(c, "tunde", 10, {
        createdAt: inbox[0]!.createdAt,
        id: inbox[0]!.id,
      }),
    );
    expect(page2.map((i) => i.id)).toEqual(inbox.slice(1).map((i) => i.id));
  });

  it("keeps notification content immutable and read state one-way", async () => {
    await expect(
      rows(ORG, `UPDATE notify.notification SET title = 'changed'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      rows(
        ORG,
        `UPDATE notify.notification SET read_at = read_at + interval '1 minute' WHERE read_at IS NOT NULL`,
      ),
    ).rejects.toThrow(/marked read only once/);
    await expect(rows(ORG, `DELETE FROM notify.notification`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps each organisation's notifications invisible to others", async () => {
    expect(
      await rows(OTHER, `SELECT count(*)::int AS n FROM notify.notification`),
    ).toEqual([{ n: 0 }]);
    expect(
      await rows(OTHER, `SELECT count(*)::int AS n FROM notify.email_delivery`),
    ).toEqual([{ n: 0 }]);
    await expect(
      rows(
        OTHER,
        `INSERT INTO notify.notification (org_id, recipient_user_id, source_event_id, event_type, entity_type,
           entity_id, title, body, show_in_app) VALUES ($1, 'x', 'e', 'proposal.submitted', 'proposal', 'p', 't', 'b', true)`,
        [ORG],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("sends each email once and retries failures with backoff before giving up", async () => {
    const claim = (n: number) =>
      db.pool.query<{ id: string; recipient_email: string; attempts: number }>(
        `SELECT id, recipient_email, attempts FROM notify.claim_email_deliveries($1, 60)`,
        [n],
      );
    const first = await claim(100);
    const pending = await admin.query(
      `SELECT count(*)::int AS n FROM notify.email_delivery`,
    );
    expect(first.rows).toHaveLength(pending.rows[0].n);
    // Leased rows are not handed out again while the lease runs.
    expect((await claim(100)).rows).toHaveLength(0);

    const [ok, bad] = first.rows;
    await db.pool.query(`SELECT notify.mark_email_sent($1, 'zepto-123')`, [
      ok!.id,
    ]);
    await db.pool.query(`SELECT notify.mark_email_sent($1, 'zepto-456')`, [
      ok!.id,
    ]); // no-op
    await db.pool.query(`SELECT notify.mark_email_failed($1, 'smtp 451', 2)`, [
      bad!.id,
    ]);
    const states = await admin.query(
      `SELECT id, status, provider_message_id, attempts, available_at > now() AS backing_off
       FROM notify.email_delivery WHERE id = ANY($1::uuid[])`,
      [[ok!.id, bad!.id]],
    );
    const byId = new Map(states.rows.map((r) => [r.id, r]));
    expect(byId.get(ok!.id)).toMatchObject({
      status: "sent",
      provider_message_id: "zepto-123",
    });
    expect(byId.get(bad!.id)).toMatchObject({
      status: "pending",
      attempts: 1,
      backing_off: true,
    });

    // Second failure reaches the attempt limit of 2 and stops retrying.
    await admin.query(
      `UPDATE notify.email_delivery SET available_at = now() WHERE id = $1`,
      [bad!.id],
    );
    const again = await claim(100);
    expect(again.rows.map((r) => r.id)).toContain(bad!.id);
    await db.pool.query(`SELECT notify.mark_email_failed($1, 'smtp 451', 2)`, [
      bad!.id,
    ]);
    const final = await admin.query(
      `SELECT status, attempts FROM notify.email_delivery WHERE id = $1`,
      [bad!.id],
    );
    expect(final.rows[0]).toEqual({ status: "failed", attempts: 2 });
  });

  it("rolls back cleanly", async () => {
    await admin.query(sql("0002_notifications.down.sql"));
    const left = await admin.query(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'notify'`,
    );
    expect(left.rows[0].n).toBe(0);
  });
});
