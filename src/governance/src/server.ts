import * as http from "node:http";
import * as http2 from "node:http2";
import { Code, ConnectError, type ConnectRouter, type Interceptor } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { GovernanceService } from "@owomide/proto/services/governance/v1/governance_pb.js";
import pino from "pino";
import { createBus } from "@owomide/bus";
import { loadConfig } from "./config.js";
import { Database } from "./db.js";
import { ObjectStore } from "./clients/object-store.js";
import { GrpcCatalogSnapshotClient } from "./clients/catalog.js";
import { GovernanceServiceImpl } from "./service.js";
import { startAuditSubscriber } from "./subscribers/audit-subscriber.js";
import { startSnapshotSubscriber } from "./subscribers/snapshot-subscriber.js";

export function errorInterceptor(logger: pino.Logger): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (error instanceof ConnectError) throw error;
      logger.error({ err: error, procedure: request.method.name }, "Governance RPC failed");
      throw new ConnectError("Internal Governance error", Code.Internal);
    }
  };
}

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

  const service = new GovernanceServiceImpl({
    pool: database.pool,
    objectStore,
    catalogClient,
    logger,
  });

  const rpcHandler = connectNodeAdapter({
    interceptors: [errorInterceptor(logger)],
    routes: (router: ConnectRouter) => router.service(GovernanceService, service.implementation),
  });
  const rpcServer = http2.createServer(rpcHandler);

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

  await Promise.all([
    new Promise<void>((resolve) => rpcServer.listen(config.grpcPort, config.host, resolve)),
    new Promise<void>((resolve) => healthServer.listen(config.healthPort, config.host, resolve)),
  ]);
  logger.info({ rpcPort: config.grpcPort, healthPort: config.healthPort }, "governance service listening");

  return async () => {
    for (const sub of [...auditSubscriptions, ...snapshotSubscriptions]) {
      await sub.unsubscribe();
    }
    await bus.subscriber.close();
    await bus.publisher.close();
    await Promise.all([
      new Promise<void>((resolve, reject) =>
        rpcServer.close((err) => (err ? reject(err) : resolve())),
      ),
      new Promise<void>((resolve, reject) =>
        healthServer.close((err) => (err ? reject(err) : resolve())),
      ),
    ]);
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
