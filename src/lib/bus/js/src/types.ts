import type { SASLOptions } from "kafkajs";

export interface EventMetadata {
  traceId?: string;
  spanId?: string;
  correlationId?: string;
}

export interface Event {
  id: string;
  type: string;
  occurredAt: string;
  partitionKey: string;
  payload: Uint8Array;
  metadata?: EventMetadata;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?: SASLOptions;
}

export interface BusConfig {
  provider: "kafka";
  kafka: KafkaConfig;
}

export type ReplayFrom = "beginning" | "latest" | { timestamp: number };

export interface SubscribeOptions {
  topic: string;
  group: string;
  replayFrom?: ReplayFrom;
  concurrency?: number;
  maxRetries?: number;
}

export type Handler = (event: Event) => Promise<void>;

export interface Subscription {
  unsubscribe(): Promise<void>;
}

export interface Publisher {
  publish(topic: string, event: Event): Promise<void>;
  close(): Promise<void>;
}

export interface Subscriber {
  subscribe(opts: SubscribeOptions, handler: Handler): Promise<Subscription>;
  close(): Promise<void>;
}

export interface Bus {
  publisher: Publisher;
  subscriber: Subscriber;
}
