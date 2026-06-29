import { Kafka, type Producer } from "kafkajs";
import type { Publisher, Event, KafkaConfig } from "../types.js";
import { serialize } from "../envelope.js";

export class KafkaPublisher implements Publisher {
  private producer: Producer;
  private connected = false;

  constructor(config: KafkaConfig) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      ssl: config.ssl,
      sasl: config.sasl,
    });

    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    });
  }

  async publish(topic: string, event: Event): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }

    const value = Buffer.from(serialize(event));

    await this.producer.send({
      topic,
      messages: [
        {
          key: event.partitionKey,
          value,
        },
      ],
    });
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}
