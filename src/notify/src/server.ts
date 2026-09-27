import * as http from "node:http";
import pino from "pino";
import { ZeptoMailClient } from "./clients/zeptomail.js";
import { loadConfig } from "./config.js";
import { Database } from "./db.js";
import { EmailWorker } from "./workers/email-sender.js";

// Notify runtime: health endpoints and the email sender.
//
// The bus subscriber (subscribers/notification-subscriber.ts) is not started here yet: it needs
// a RecipientDirectory backed by RBAC (rbac.members_with_permission exposed as an RPC, which
// needs `make proto`). Until then no in-app notifications are created in a deployed stack.

export async function startServer(): Promise<() => Promise<void>> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const database = new Database(config.databaseUrl);
  const stop = new AbortController();
  let emailLoop: Promise<void> = Promise.resolve();

  if (config.zeptomail) {
    const worker = new EmailWorker(
      database.pool,
      new ZeptoMailClient(config.zeptomail),
      logger,
      {
        batchSize: config.emailBatchSize,
        leaseSeconds: 60,
        maxAttempts: config.emailMaxAttempts,
      },
    );
    emailLoop = worker.run(config.emailPollMs, stop.signal);
    logger.info("email sender started");
  } else {
    logger.warn(
      "ZEPTOMAIL_TOKEN is not set: emails stay queued and are not sent",
    );
  }

  const health = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200).end("ok");
    } else if (req.url === "/readyz") {
      database.ready().then(
        (ready) =>
          res
            .writeHead(ready ? 200 : 503)
            .end(ready ? "ready" : "database unavailable"),
        () => res.writeHead(503).end("database unavailable"),
      );
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) =>
    health.listen(config.healthPort, config.host, resolve),
  );
  logger.info({ port: config.healthPort }, "notify health server listening");

  return async () => {
    stop.abort();
    await emailLoop;
    await new Promise<void>((resolve) => health.close(() => resolve()));
    await database.close();
  };
}

async function main(): Promise<void> {
  const stop = await startServer();
  const shutdown = async () => {
    await stop();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

const isDirectRun =
  process.argv[1]?.endsWith("server.ts") ||
  process.argv[1]?.endsWith("server.js");
if (isDirectRun)
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
