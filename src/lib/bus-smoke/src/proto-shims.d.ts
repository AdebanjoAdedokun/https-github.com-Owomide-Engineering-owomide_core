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
