export interface SmokeConfig {
  kafkaBrokers: string[];
  clientId: string;
  topic: string;
  publishIntervalMs: number;
  port: number;
}

export function loadConfig(role: "publisher" | "subscriber"): SmokeConfig {
  return {
    kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((broker) => broker.trim())
      .filter(Boolean),
    clientId: process.env.KAFKA_CLIENT_ID ?? `bus-smoke-${role}`,
    topic: process.env.BUS_SMOKE_TOPIC ?? "test.ping",
    publishIntervalMs: Number(process.env.BUS_SMOKE_INTERVAL_MS ?? "5000"),
    port: Number(process.env.PORT ?? "5100"),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
