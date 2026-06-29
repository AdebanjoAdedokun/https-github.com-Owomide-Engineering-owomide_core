import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "../envelope.js";
import type { Event } from "../types.js";

describe("envelope", () => {
  it("round-trips an event through serialize/deserialize", () => {
    const event: Event = {
      id: "evt_001",
      type: "proposal.submitted",
      occurredAt: "2026-06-29T12:00:00Z",
      partitionKey: "prop_abc",
      payload: new Uint8Array([10, 14, 112, 114, 111, 112, 95, 97, 98, 99]),
      metadata: {
        traceId: "trace-123",
        spanId: "span-456",
        correlationId: "corr-789",
      },
    };

    const bytes = serialize(event);
    const result = deserialize(bytes);

    expect(result.id).toBe(event.id);
    expect(result.type).toBe(event.type);
    expect(result.occurredAt).toBe(event.occurredAt);
    expect(result.partitionKey).toBe(event.partitionKey);
    expect(result.payload).toEqual(event.payload);
    expect(result.metadata?.traceId).toBe("trace-123");
    expect(result.metadata?.spanId).toBe("span-456");
    expect(result.metadata?.correlationId).toBe("corr-789");
  });

  it("round-trips an event without metadata", () => {
    const event: Event = {
      id: "evt_002",
      type: "import.committed",
      occurredAt: "2026-06-29T13:00:00Z",
      partitionKey: "batch_xyz",
      payload: new Uint8Array([1, 2, 3]),
    };

    const bytes = serialize(event);
    const result = deserialize(bytes);

    expect(result.id).toBe(event.id);
    expect(result.type).toBe(event.type);
    expect(result.payload).toEqual(event.payload);
    expect(result.metadata).toBeUndefined();
  });

  it("handles empty payload", () => {
    const event: Event = {
      id: "evt_003",
      type: "test.empty",
      occurredAt: "2026-06-29T14:00:00Z",
      partitionKey: "key_1",
      payload: new Uint8Array(0),
    };

    const bytes = serialize(event);
    const result = deserialize(bytes);

    expect(result.id).toBe("evt_003");
    expect(result.payload).toEqual(new Uint8Array(0));
  });

  it("preserves binary payload integrity", () => {
    const payload = new Uint8Array(256);
    for (let i = 0; i < 256; i++) payload[i] = i;

    const event: Event = {
      id: "evt_004",
      type: "test.binary",
      occurredAt: "2026-06-29T15:00:00Z",
      partitionKey: "key_2",
      payload,
    };

    const bytes = serialize(event);
    const result = deserialize(bytes);

    expect(result.payload).toEqual(payload);
  });
});
