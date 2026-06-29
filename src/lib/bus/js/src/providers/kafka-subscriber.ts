import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";
import type {
  Subscriber,
  Subscription,
  SubscribeOptions,
  Handler,
  KafkaConfig,
} from "../types.js";
import { deserialize  } from "../envelope.js";

export class KafkaSubscriber implements Subscriber {
  private kafka: Kafka;
  private consumers: Consumer[] = [];

  constructor(private config: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      ssl: config.ssl,
      sasl: config.sasl,
    });
  }

  async subscribe(
    opts: SubscribeOptions,
    handler: Handler,
  ): Promise<Subscription> {
    const maxRetries = opts.maxRetries ?? 5;

    const consumer = this.kafka.consumer({
      groupId: opts.group,
      maxInFlightRequests: opts.concurrency ?? 10,
    });

    await consumer.connect();

    const fromBeginning = opts.replayFrom === "beginning";

    await consumer.subscribe({ topic: opts.topic, fromBeginning });

    await consumer.run({
      eachMessage: async (messagePayload: EachMessagePayload) => {
        const { message } = messagePayload;
        if (!message.value) return;

        const event = deserialize(new Uint8Array(message.value));

        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            await handler(event);
            return;
          } catch (err) {
            attempt++;
            if (attempt > maxRetries) {
              await this.sendToDlq(opts.topic, message.value, err);
              return;
            }
            const backoff = Math.min(1000 * 2 ** (attempt - 1), 30_000);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      },
    });

    this.consumers.push(consumer);

    return {
      unsubscribe: async () => {
        await consumer.disconnect();
        this.consumers = this.consumers.filter((c) => c !== consumer);
      },
    };
  }

  private async sendToDlq(
    topic: string,
    originalValue: Buffer,
    error: unknown,
  ): Promise<void> {
    const dlqProducer = this.kafka.producer();
    try {
      await dlqProducer.connect();
      await dlqProducer.send({
        topic: `${topic}.dlq`,
        messages: [
          {
            value: originalValue,
            headers: {
              "x-error": String(error instanceof Error ? error.message : error),
              "x-original-topic": topic,
              "x-failed-at": new Date().toISOString(),
            },
          },
        ],
      });
    } finally {
      await dlqProducer.disconnect();
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.consumers.map((c) => c.disconnect()));
    this.consumers = [];
  }
}
