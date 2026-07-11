import { setTimeout as delay } from "node:timers/promises";
import { createBus } from "@owomide/bus";
import pino from "pino";
import { loadConfig } from "./config.js";
import { Database } from "./db.js";
import { OutboxWorker } from "./outbox.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const database = new Database(config);
  const bus = createBus({
    provider: "kafka",
    kafka: { brokers: config.kafkaBrokerList, clientId: config.kafkaClientId },
  });
  const worker = new OutboxWorker(database, bus.publisher, config.outboxBatchSize);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  logger.info("Catalog outbox worker started");
  while (!stopping) {
    try {
      const count = await worker.runOnce();
      if (count === 0) await delay(config.outboxPollMs);
    } catch (error) {
      logger.error({ err: error }, "Catalog outbox poll failed");
      await delay(config.outboxPollMs);
    }
  }
  await bus.publisher.close();
  await database.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
