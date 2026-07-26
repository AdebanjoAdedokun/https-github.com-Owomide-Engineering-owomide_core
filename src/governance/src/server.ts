import * as http from "node:http";
import pino from "pino";
import { createBus } from "@owomide/bus";
import { loadConfig } from "./config.js";
import { Database } from "./db.js";
import { ObjectStore } from "./clients/object-store.js";
import { GrpcCatalogSnapshotClient } from "./clients/catalog.js";
import { startAuditSubscriber } from "./subscribers/audit-subscriber.js";
import { startSnapshotSubscriber } from "./subscribers/snapshot-subscriber.js";

export async function startServer(): Promise<() => Promise<void>> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const database = new Database(config.databaseUrl);
  const bus = createBus({
    provider: "kafka",
    kafka: { brokers: [config.kafkaBroker], clientId: "governance-svc" },
  });

  const objectStore = new ObjectStore({
    endpoint: config.minioEndpoint,
    accessKey: config.minioAccessKey,
    secretKey: config.minioSecretKey,
    secure: config.minioSecure,
    bucket: config.minioBucket,
  });

  const catalogClient = new GrpcCatalogSnapshotClient(
    config.catalogUrl,
    config.catalogServiceSecret,
    config.serviceJwtIssuer,
  );

  const auditSubscriptions = await startAuditSubscriber(bus.subscriber, database.pool, logger);
  const snapshotSubscriptions = await startSnapshotSubscriber(
    bus.subscriber,
    {
      pool: database.pool,
      catalogClient,
      objectStore,
      debounceMs: config.snapshotDebounceMs,
    },
    logger,
  );

  const healthServer = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"status":"ok"}');
      return;
    }
    if (req.url === "/readyz") {
      const [dbReady, minioReady] = await Promise.all([database.ready(), objectStore.ready()]);
      const ready = dbReady && minioReady;
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => healthServer.listen(config.healthPort, resolve));
  logger.info({ healthPort: config.healthPort }, "governance service listening");

  return async () => {
    for (const sub of [...auditSubscriptions, ...snapshotSubscriptions]) {
      await sub.unsubscribe();
    }
    await bus.subscriber.close();
    await bus.publisher.close();
    await new Promise<void>((resolve, reject) =>
      healthServer.close((err) => (err ? reject(err) : resolve())),
    );
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
  process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isDirectRun)
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
