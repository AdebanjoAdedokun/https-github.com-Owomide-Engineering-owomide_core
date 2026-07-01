import { create, toBinary } from "@bufbuild/protobuf";
import { TestPingSchema } from "@owomide/proto/events/test/v1_pb.js";
import { createBus, type Bus } from "@owomide/bus";
import { randomUUID } from "node:crypto";
import { loadConfig, sleep } from "./config.js";

const config = loadConfig("publisher");

function createPingPayload(pingId: string): Uint8Array {
  return toBinary(
    TestPingSchema,
    create(TestPingSchema, {
      pingId,
      source: config.clientId,
      sentAt: new Date().toISOString(),
    }),
  );
}

async function publishLoop(bus: Bus): Promise<void> {
  for (;;) {
    const pingId = randomUUID();
    await bus.publisher.publish(config.topic, {
      id: pingId,
      type: config.topic,
      occurredAt: new Date().toISOString(),
      partitionKey: "bus-smoke",
      payload: createPingPayload(pingId),
      metadata: { correlationId: pingId },
    });

    console.log(
      JSON.stringify({
        message: "published bus smoke ping",
        topic: config.topic,
        pingId,
      }),
    );

    await sleep(config.publishIntervalMs);
  }
}

async function main(): Promise<void> {
  for (;;) {
    const bus = createBus({
      provider: "kafka",
      kafka: { brokers: config.kafkaBrokers, clientId: config.clientId },
    });

    try {
      await publishLoop(bus);
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "bus smoke publisher retrying after failure",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      await bus.publisher.close();
      await sleep(5000);
    }
  }
}

void main();
