import { fromBinary } from "@bufbuild/protobuf";
import { TestPingSchema } from "@owomide/proto/events/test/v1_pb.js";
import { createBus, type Bus } from "@owomide/bus";
import Fastify from "fastify";
import { loadConfig, sleep } from "./config.js";

const config = loadConfig("subscriber");
const app = Fastify({ logger: true });

let bus: Bus | undefined;
let subscribed = false;
let lastPing:
  | {
      pingId: string;
      source: string;
      receivedAt: string;
    }
  | undefined;

app.get("/healthz", async () => ({
  ok: true,
  subscribed,
}));

app.get("/readyz", { logLevel: "warn" }, async (_request, reply) => {
  if (!lastPing) {
    return reply.code(503).send({
      ready: false,
      message: "no test.ping received yet",
    });
  }

  return {
    ready: true,
    topic: config.topic,
    lastPing,
  };
});

async function subscribeWithRetry(): Promise<void> {
  for (;;) {
    bus = createBus({
      provider: "kafka",
      kafka: { brokers: config.kafkaBrokers, clientId: config.clientId },
    });

    try {
      await bus.subscriber.subscribe(
        {
          topic: config.topic,
          group: "bus-smoke.receiver",
          replayFrom: "latest",
          concurrency: 1,
          maxRetries: 3,
        },
        async (event) => {
          const ping = fromBinary(TestPingSchema, event.payload);
          lastPing = {
            pingId: ping.pingId,
            source: ping.source,
            receivedAt: new Date().toISOString(),
          };

          requestLog("received bus smoke ping", {
            topic: config.topic,
            eventId: event.id,
            pingId: ping.pingId,
            source: ping.source,
          });
        },
      );
      subscribed = true;
      return;
    } catch (err) {
      subscribed = false;
      requestLog("bus smoke subscriber retrying after failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      await bus.subscriber.close();
      await sleep(5000);
    }
  }
}

function requestLog(message: string, fields: Record<string, unknown>): void {
  app.log.info(fields, message);
}

async function shutdown(): Promise<void> {
  await bus?.subscriber.close();
  await app.close();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ host: "0.0.0.0", port: config.port });
void subscribeWithRetry();
