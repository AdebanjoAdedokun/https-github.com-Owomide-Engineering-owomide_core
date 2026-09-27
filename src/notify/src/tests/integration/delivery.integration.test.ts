import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create, toBinary } from "@bufbuild/protobuf";
import type {
  Event,
  Handler,
  Subscriber,
  SubscribeOptions,
} from "@owomide/bus";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProposalSubmittedSchema } from "@owomide/proto/events/proposal/v1_pb.js";
import {
  EmailSendError,
  type EmailSender,
  type OutgoingEmail,
} from "../../clients/zeptomail.js";
import { Database } from "../../db.js";
import type { RecipientDirectory } from "../../domain/routing.js";
import { startNotificationSubscriber } from "../../subscribers/notification-subscriber.js";
import { EmailWorker } from "../../workers/email-sender.js";

// The email sender and the bus subscriber against PostgreSQL as notify_svc. Runs against a
// disposable container, or against NOTIFY_TEST_DATABASE_URL (a superuser URL for an empty
// database) where containers are unavailable.

const MIGRATIONS = ["0001_create_schema.up.sql", "0002_notifications.up.sql"];
const sql = (f: string) =>
  readFileSync(resolve(process.cwd(), "migrations", f), "utf8");
const ORG = "org-lagos";

const directory: RecipientDirectory = {
  usersWithPermission: async () => ["tunde", "bisi", "kemi"],
  emailAddresses: async () =>
    new Map([
      ["tunde", "tunde@example.test"],
      ["bisi", "bisi@example.test"],
      ["kemi", "kemi@invalid.example"],
    ]),
};

const silent = { info: () => {}, warn: () => {}, error: () => {} };

/** An in-memory bus subscriber that lets the test deliver events, including duplicates. */
class FakeSubscriber implements Subscriber {
  handlers = new Map<string, Handler>();
  groups: string[] = [];
  async subscribe(opts: SubscribeOptions, handler: Handler) {
    this.handlers.set(opts.topic, handler);
    this.groups.push(opts.group);
    return { unsubscribe: async () => {} };
  }
  async close() {}
  async deliver(event: Event) {
    await this.handlers.get(event.type)!(event);
  }
}

describe("Notify delivery", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let admin: pg.Client;
  let db: Database;

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

  it("stores each event's notifications once, however often the bus delivers it", async () => {
    const bus = new FakeSubscriber();
    await startNotificationSubscriber(
      bus,
      { db, directory, appBaseUrl: "https://app.example.test" },
      silent,
    );
    expect(new Set(bus.groups)).toEqual(new Set(["notify.inapp"]));
    const event: Event = {
      id: "evt-sub-1",
      type: "proposal.submitted",
      occurredAt: new Date().toISOString(),
      partitionKey: "p-1",
      payload: toBinary(
        ProposalSubmittedSchema,
        create(ProposalSubmittedSchema, {
          orgId: ORG,
          proposalId: "p-1",
          actorId: "ada",
        }),
      ),
    };
    await bus.deliver(event);
    await bus.deliver(event);
    const counts = await admin.query(
      `SELECT (SELECT count(*)::int FROM notify.notification) AS notifications,
              (SELECT count(*)::int FROM notify.email_delivery) AS emails`,
    );
    expect(counts.rows[0]).toEqual({ notifications: 3, emails: 3 });
  });

  it("sends, retries or gives up per email, and never sends one twice", async () => {
    const sent: OutgoingEmail[] = [];
    let unavailable = true;
    const sender: EmailSender = {
      async send(email) {
        if (email.to.endsWith("@invalid.example")) {
          throw new EmailSendError("ZeptoMail 400: invalid address", true);
        }
        if (email.to.startsWith("bisi") && unavailable) {
          throw new EmailSendError("ZeptoMail 503", false);
        }
        sent.push(email);
        return { providerMessageId: `zm-${sent.length}` };
      },
    };
    const worker = new EmailWorker(db.pool, sender, silent, {
      batchSize: 10,
      leaseSeconds: 60,
      maxAttempts: 3,
    });

    expect(await worker.runOnce()).toEqual({
      claimed: 3,
      sent: 1,
      retrying: 1,
      failed: 1,
    });
    // Nothing is due: Bisi's retry is backing off, the others are settled.
    expect(await worker.runOnce()).toEqual({
      claimed: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
    });

    unavailable = false;
    await admin.query(
      `UPDATE notify.email_delivery SET available_at = now() WHERE status = 'pending'`,
    );
    expect(await worker.runOnce()).toEqual({
      claimed: 1,
      sent: 1,
      retrying: 0,
      failed: 0,
    });

    expect(sent.map((e) => e.to).sort()).toEqual([
      "bisi@example.test",
      "tunde@example.test",
    ]);
    expect(sent[0]!.subject).toBe("Owómidé: A proposal needs your review");
    const states = await admin.query(
      `SELECT recipient_email, status, attempts, provider_message_id IS NOT NULL AS has_id
       FROM notify.email_delivery ORDER BY recipient_email`,
    );
    expect(states.rows).toEqual([
      {
        recipient_email: "bisi@example.test",
        status: "sent",
        attempts: 2,
        has_id: true,
      },
      {
        recipient_email: "kemi@invalid.example",
        status: "failed",
        attempts: 1,
        has_id: false,
      },
      {
        recipient_email: "tunde@example.test",
        status: "sent",
        attempts: 1,
        has_id: true,
      },
    ]);
  });

  it("stops the polling loop promptly when asked", async () => {
    const worker = new EmailWorker(
      db.pool,
      { send: async () => ({ providerMessageId: "x" }) },
      silent,
      { batchSize: 10, leaseSeconds: 60, maxAttempts: 3 },
    );
    const stop = new AbortController();
    const loop = worker.run(60_000, stop.signal);
    setTimeout(() => stop.abort(), 50);
    const started = Date.now();
    await loop;
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
