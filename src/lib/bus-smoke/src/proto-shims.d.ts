declare module "@owomide/proto/events/test/v1_pb.js" {
  export type TestPing =
    import("@bufbuild/protobuf").Message<"owomide.events.test.v1.TestPing"> & {
      pingId: string;
      source: string;
      sentAt: string;
    };

  export const TestPingSchema: import("@bufbuild/protobuf/codegenv2").GenMessage<TestPing>;
}

declare module "@owomide/proto/events/envelope_pb.js" {
  export type EventEnvelope =
    import("@bufbuild/protobuf").Message<"owomide.events.EventEnvelope"> & {
      id: string;
      type: string;
      occurredAt: string;
      partitionKey: string;
      payload: Uint8Array;
      metadata?: EventMetadata | undefined;
    };

  export type EventMetadata =
    import("@bufbuild/protobuf").Message<"owomide.events.EventMetadata"> & {
      traceId: string;
      spanId: string;
      correlationId: string;
    };

  export const EventEnvelopeSchema: import("@bufbuild/protobuf/codegenv2").GenMessage<EventEnvelope>;
  export const EventMetadataSchema: import("@bufbuild/protobuf/codegenv2").GenMessage<EventMetadata>;
}

declare module "@owomide/bus" {
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
    sasl?: unknown;
  }

  export interface BusConfig {
    provider: "kafka";
    kafka: KafkaConfig;
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
    subscribe(
      opts: {
        topic: string;
        group: string;
        replayFrom?: "beginning" | "latest" | { timestamp: number };
        concurrency?: number;
        maxRetries?: number;
      },
      handler: Handler,
    ): Promise<Subscription>;
    close(): Promise<void>;
  }

  export interface Bus {
    publisher: Publisher;
    subscriber: Subscriber;
  }

  export function createBus(config: BusConfig): Bus;
}
