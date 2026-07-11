import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65_535).default(50_052),
  healthPort: z.coerce.number().int().min(1).max(65_535).default(8_080),
  host: z.string().default("0.0.0.0"),
  databaseUrl: z.string().url(),
  databasePoolSize: z.coerce.number().int().min(1).max(100).default(20),
  databaseStatementTimeoutMs: z.coerce.number().int().min(100).default(15_000),
  serviceJwtIssuer: z.string().min(1).default("owomide-internal"),
  serviceSecretsJson: z.string().default("{}"),
  kafkaBrokers: z.string().default("localhost:9092"),
  kafkaClientId: z.string().default("catalog"),
  outboxPollMs: z.coerce.number().int().min(100).default(1_000),
  outboxBatchSize: z.coerce.number().int().min(1).max(500).default(100),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface CatalogConfig extends z.infer<typeof ConfigSchema> {
  serviceSecrets: Readonly<Record<string, string>>;
  kafkaBrokerList: string[];
}

function parseServiceSecrets(raw: string): Readonly<Record<string, string>> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("CATALOG_SERVICE_SECRETS_JSON must be valid JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("CATALOG_SERVICE_SECRETS_JSON must be a JSON object");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const parsed: Record<string, string> = {};
  for (const [service, secret] of entries) {
    if (!service.trim() || typeof secret !== "string" || secret.length < 32) {
      throw new Error(`Service secret for ${service || "<empty>"} must be at least 32 characters`);
    }
    parsed[service] = secret;
  }
  return Object.freeze(parsed);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CatalogConfig {
  const base = ConfigSchema.parse({
    port: env["PORT"],
    healthPort: env["HEALTH_PORT"],
    host: env["HOST"],
    databaseUrl: env["CATALOG_DATABASE_URL"],
    databasePoolSize: env["CATALOG_DATABASE_POOL_SIZE"],
    databaseStatementTimeoutMs: env["CATALOG_DATABASE_STATEMENT_TIMEOUT_MS"],
    serviceJwtIssuer: env["CATALOG_SERVICE_JWT_ISSUER"],
    serviceSecretsJson: env["CATALOG_SERVICE_SECRETS_JSON"],
    kafkaBrokers: env["KAFKA_BROKERS"],
    kafkaClientId: env["KAFKA_CLIENT_ID"],
    outboxPollMs: env["CATALOG_OUTBOX_POLL_MS"],
    outboxBatchSize: env["CATALOG_OUTBOX_BATCH_SIZE"],
    logLevel: env["LOG_LEVEL"],
  });
  const kafkaBrokerList = base.kafkaBrokers
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (kafkaBrokerList.length === 0)
    throw new Error("KAFKA_BROKERS must contain at least one broker");
  return {
    ...base,
    serviceSecrets: parseServiceSecrets(base.serviceSecretsJson),
    kafkaBrokerList,
  };
}
