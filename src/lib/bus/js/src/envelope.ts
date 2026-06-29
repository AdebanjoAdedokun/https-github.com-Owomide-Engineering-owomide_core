import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import {
  EventEnvelopeSchema,
  EventMetadataSchema,
} from "@owomide/proto/events/envelope_pb.js";
import type { Event, EventMetadata } from "./types.js";

export function serialize(event: Event): Uint8Array {
  const envelope = create(EventEnvelopeSchema, {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    partitionKey: event.partitionKey,
    payload: event.payload,
    metadata: event.metadata
      ? create(EventMetadataSchema, {
          traceId: event.metadata.traceId ?? "",
          spanId: event.metadata.spanId ?? "",
          correlationId: event.metadata.correlationId ?? "",
        })
      : undefined,
  });
  return toBinary(EventEnvelopeSchema, envelope);
}

export function deserialize(bytes: Uint8Array): Event {
  const envelope = fromBinary(EventEnvelopeSchema, bytes);

  const metadata: EventMetadata | undefined = envelope.metadata
    ? {
        traceId: envelope.metadata.traceId || undefined,
        spanId: envelope.metadata.spanId || undefined,
        correlationId: envelope.metadata.correlationId || undefined,
      }
    : undefined;

  return {
    id: envelope.id,
    type: envelope.type,
    occurredAt: envelope.occurredAt,
    partitionKey: envelope.partitionKey,
    payload: envelope.payload,
    metadata,
  };
}
