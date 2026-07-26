export interface GovernanceConfig {
  databaseUrl: string;
  kafkaBroker: string;
  logLevel: string;
  healthPort: number;
}

export function loadConfig(): GovernanceConfig {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return {
    databaseUrl,
    kafkaBroker: process.env["KAFKA_BROKER"] ?? "localhost:9092",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    healthPort: Number(process.env["HEALTH_PORT"] ?? "8081"),
  };
}
