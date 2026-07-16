import * as http from "node:http";
import * as http2 from "node:http2";
import { Code, ConnectError, type ConnectRouter, type Interceptor } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { ProposalService } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import pino from "pino";
import { loadConfig } from "./config.js";
import { ServiceAuthenticator } from "./context.js";
import { Database } from "./db.js";
import { ProposalRepository } from "./repo/proposal-repository.js";
import { ProposalServiceImpl } from "./service.js";

export function errorInterceptor(logger: pino.Logger): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (error instanceof ConnectError) throw error;
      logger.error({ err: error, procedure: request.method.name }, "Proposal RPC failed");
      throw new ConnectError("Internal Proposal error", Code.Internal);
    }
  };
}

export async function startServer(): Promise<() => Promise<void>> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const database = new Database(config);
  const authenticator = new ServiceAuthenticator(config.serviceJwtIssuer, config.serviceSecrets);
  const repo = new ProposalRepository();
  const service = new ProposalServiceImpl(database, authenticator, repo);

  const rpcHandler = connectNodeAdapter({
    interceptors: [errorInterceptor(logger)],
    routes: (router: ConnectRouter) => router.service(ProposalService, service.implementation),
  });
  const rpcServer = http2.createServer(rpcHandler);
  const healthServer = http.createServer(async (request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.url === "/readyz") {
      const ready = await database.ready();
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
      return;
    }
    response.writeHead(404).end();
  });

  await Promise.all([
    new Promise<void>((resolve) => rpcServer.listen(config.port, config.host, resolve)),
    new Promise<void>((resolve) => healthServer.listen(config.healthPort, config.host, resolve)),
  ]);
  logger.info({ rpcPort: config.port, healthPort: config.healthPort }, "Proposal service listening");

  return async () => {
    await Promise.all([
      new Promise<void>((resolve, reject) =>
        rpcServer.close((error) => (error ? reject(error) : resolve()))
      ),
      new Promise<void>((resolve, reject) =>
        healthServer.close((error) => (error ? reject(error) : resolve()))
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
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
