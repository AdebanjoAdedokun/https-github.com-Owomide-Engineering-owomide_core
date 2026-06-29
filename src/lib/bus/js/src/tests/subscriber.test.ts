import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event } from "../types.js";
import { serialize } from "../envelope.js";

let eachMessageHandler: ((payload: { message: { value: Buffer | null; key: Buffer | null } }) => Promise<void>) | undefined;

const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockConsumerConnect = vi.fn().mockResolvedValue(undefined);
const mockConsumerDisconnect = vi.fn().mockResolvedValue(undefined);
const mockRun = vi.fn().mockImplementation(async (opts: { eachMessage: typeof eachMessageHandler }) => {
  eachMessageHandler = opts.eachMessage;
});

const mockDlqSend = vi.fn().mockResolvedValue(undefined);
const mockDlqConnect = vi.fn().mockResolvedValue(undefined);
const mockDlqDisconnect = vi.fn().mockResolvedValue(undefined);

let producerCallCount = 0;

vi.mock("kafkajs", () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    consumer: vi.fn().mockReturnValue({
      connect: mockConsumerConnect,
      disconnect: mockConsumerDisconnect,
      subscribe: mockSubscribe,
      run: mockRun,
    }),
    producer: vi.fn().mockImplementation(() => {
      producerCallCount++;
      return {
        connect: mockDlqConnect,
        disconnect: mockDlqDisconnect,
        send: mockDlqSend,
      };
    }),
  })),
}));

import { KafkaSubscriber } from "../providers/kafka-subscriber.js";

describe("KafkaSubscriber", () => {
  let subscriber: KafkaSubscriber;

  const testEvent: Event = {
    id: "evt_sub_001",
    type: "proposal.submitted",
    occurredAt: "2026-06-29T12:00:00Z",
    partitionKey: "prop_abc",
    payload: new Uint8Array([10, 5, 104, 101, 108, 108, 111]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eachMessageHandler = undefined;
    producerCallCount = 0;
    subscriber = new KafkaSubscriber({
      brokers: ["localhost:9092"],
      clientId: "test-subscriber",
    });
  });

  it("subscribes to a topic with consumer group", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await subscriber.subscribe(
      { topic: "proposal.submitted", group: "governance.audit" },
      handler,
    );

    expect(mockConsumerConnect).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledWith({
      topic: "proposal.submitted",
      fromBeginning: false,
    });
  });

  it("subscribes from beginning when replayFrom is 'beginning'", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await subscriber.subscribe(
      { topic: "proposal.submitted", group: "test.replay", replayFrom: "beginning" },
      handler,
    );

    expect(mockSubscribe).toHaveBeenCalledWith({
      topic: "proposal.submitted",
      fromBeginning: true,
    });
  });

  it("deserializes and passes events to handler", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await subscriber.subscribe(
      { topic: "proposal.submitted", group: "test.handler" },
      handler,
    );

    const serialized = serialize(testEvent);
    await eachMessageHandler!({
      message: { value: Buffer.from(serialized), key: null },
    });

    expect(handler).toHaveBeenCalledOnce();
    const received = handler.mock.calls[0]![0] as Event;
    expect(received.id).toBe("evt_sub_001");
    expect(received.type).toBe("proposal.submitted");
  });

  it("skips messages with null value", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await subscriber.subscribe(
      { topic: "proposal.submitted", group: "test.null" },
      handler,
    );

    await eachMessageHandler!({ message: { value: null, key: null } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("sends to DLQ after max retries", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("handler failed"));
    await subscriber.subscribe(
      { topic: "proposal.submitted", group: "test.dlq", maxRetries: 1 },
      handler,
    );

    const serialized = serialize(testEvent);
    await eachMessageHandler!({
      message: { value: Buffer.from(serialized), key: null },
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(mockDlqSend).toHaveBeenCalledOnce();
    const dlqCall = mockDlqSend.mock.calls[0]![0];
    expect(dlqCall.topic).toBe("proposal.submitted.dlq");
  });

  it("unsubscribe disconnects the consumer", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const subscription = await subscriber.subscribe(
      { topic: "proposal.submitted", group: "test.unsub" },
      handler,
    );

    await subscription.unsubscribe();
    expect(mockConsumerDisconnect).toHaveBeenCalledOnce();
  });
});
