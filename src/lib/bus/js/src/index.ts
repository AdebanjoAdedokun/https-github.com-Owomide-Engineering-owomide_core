import { KafkaPublisher } from "./providers/kafka-publisher.js";
import { KafkaSubscriber } from "./providers/kafka-subscriber.js";
import type { Bus, BusConfig } from "./types.js";

export function createBus(config: BusConfig): Bus {
  switch (config.provider) {
    case "kafka":
      return {
        publisher: new KafkaPublisher(config.kafka),
        subscriber: new KafkaSubscriber(config.kafka),
      };
    default:
      throw new Error(`Unknown bus provider: ${String(config.provider)}`);
  }
}

export type {
  Event,
  EventMetadata,
  Publisher,
  Subscriber,
  Subscription,
  Handler,
  SubscribeOptions,
  BusConfig,
  KafkaConfig,
  ReplayFrom,
  Bus,
} from "./types.js";

export { serialize, deserialize } from "./envelope.js";
