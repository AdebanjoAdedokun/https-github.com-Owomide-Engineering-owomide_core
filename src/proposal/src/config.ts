import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65_535).default(50_053),
  healthPort: z.coerce.number().int().min(1).max(65_535).default(8_080),
  host: z.string().default("0.0.0.0"),
  databaseUrl: z.string().url(),
  databasePoolSize: z.coerce.number().int().min(1).max(100).default(20),
  databaseStatementTimeoutMs: z.coerce.number().int().min(100).default(15_000),
  serviceJwtIssuer: z.string().min(1).default("owomide-internal"),
  serviceSecretsJson: z.string().default("{}"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  kafkaBroker: z.string().default("localhost:9092"),
  catalogUrl: z.string().url().default("http://localhost:50052"),
});

export interface ProposalConfig extends z.infer<typeof ConfigSchema> {
  serviceSecrets: Readonly<Record<string, string>>;
}

function parseServiceSecrets(raw: string): Readonly<Record<string, string>> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("PROPOSAL_SERVICE_SECRETS_JSON must be valid JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("PROPOSAL_SERVICE_SECRETS_JSON must be a JSON object");
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProposalConfig {
  const base = ConfigSchema.parse({
    port: env["PORT"],
    healthPort: env["HEALTH_PORT"],
    host: env["HOST"],
    databaseUrl: env["PROPOSAL_DATABASE_URL"],
    databasePoolSize: env["PROPOSAL_DATABASE_POOL_SIZE"],
    databaseStatementTimeoutMs: env["PROPOSAL_DATABASE_STATEMENT_TIMEOUT_MS"],
    serviceJwtIssuer: env["PROPOSAL_SERVICE_JWT_ISSUER"],
    serviceSecretsJson: env["PROPOSAL_SERVICE_SECRETS_JSON"],
    logLevel: env["LOG_LEVEL"],
    kafkaBroker: env["KAFKA_BROKER"],
    catalogUrl: env["CATALOG_URL"],
  });
  return {
    ...base,
    serviceSecrets: parseServiceSecrets(base.serviceSecretsJson),
  };
}
