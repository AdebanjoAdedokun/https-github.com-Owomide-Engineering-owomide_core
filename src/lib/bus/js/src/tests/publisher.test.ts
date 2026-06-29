import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event } from "../types.js";

vi.mock("kafkajs", () => {
  const mockSend = vi.fn().mockResolvedValue(undefined);
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);

  return {
    Kafka: vi.fn().mockImplementation(() => ({
      producer: vi.fn().mockReturnValue({
        connect: mockConnect,
        disconnect: mockDisconnect,
        send: mockSend,
      }),
    })),
    _mockSend: mockSend,
    _mockConnect: mockConnect,
    _mockDisconnect: mockDisconnect,
  };
});

import { KafkaPublisher } from "../providers/kafka-publisher.js";
import { deserialize } from "../envelope.js";

const kafkaMocks = await import("kafkajs");
const mockSend = (kafkaMocks as Record<string, ReturnType<typeof vi.fn>>)["_mockSend"];
const mockConnect = (kafkaMocks as Record<string, ReturnType<typeof vi.fn>>)["_mockConnect"];
const mockDisconnect = (kafkaMocks as Record<string, ReturnType<typeof vi.fn>>)["_mockDisconnect"];

describe("KafkaPublisher", () => {
  let publisher: KafkaPublisher;

  const testEvent: Event = {
    id: "evt_pub_001",
    type: "proposal.submitted",
    occurredAt: "2026-06-29T12:00:00Z",
    partitionKey: "prop_abc",
    payload: new Uint8Array([10, 5, 104, 101, 108, 108, 111]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new KafkaPublisher({
      brokers: ["localhost:9092"],
      clientId: "test-publisher",
    });
  });

  it("connects on first publish", async () => {
    await publisher.publish("proposal.submitted", testEvent);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("does not reconnect on subsequent publishes", async () => {
    await publisher.publish("proposal.submitted", testEvent);
    await publisher.publish("proposal.submitted", testEvent);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("sends serialized protobuf envelope with partition key", async () => {
    await publisher.publish("proposal.submitted", testEvent);

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0]![0];
    expect(call.topic).toBe("proposal.submitted");
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].key).toBe("prop_abc");

    const deserialized = deserialize(new Uint8Array(call.messages[0].value));
    expect(deserialized.id).toBe("evt_pub_001");
    expect(deserialized.type).toBe("proposal.submitted");
    expect(deserialized.payload).toEqual(testEvent.payload);
  });

  it("disconnects on close", async () => {
    await publisher.publish("proposal.submitted", testEvent);
    await publisher.close();
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it("close is safe when not connected", async () => {
    await publisher.close();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
