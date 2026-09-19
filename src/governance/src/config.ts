export interface GovernanceConfig {
  databaseUrl: string;
  kafkaBroker: string;
  logLevel: string;
  grpcPort: number;
  host: string;
  healthPort: number;
  catalogUrl: string;
  catalogServiceSecret: string;
  rbacUrl: string;
  rbacServiceSecret: string;
  serviceJwtIssuer: string;
  serviceSecrets: Readonly<Record<string, string>>;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioSecure: boolean;
  minioBucket: string;
  snapshotDebounceMs: number;
}

function parseServiceSecrets(raw: string): Readonly<Record<string, string>> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("GOVERNANCE_SERVICE_SECRETS_JSON must be valid JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("GOVERNANCE_SERVICE_SECRETS_JSON must be a JSON object");
  }
  const parsed: Record<string, string> = {};
  for (const [service, secret] of Object.entries(value as Record<string, unknown>)) {
    if (!service.trim() || typeof secret !== "string" || secret.length < 32) {
      throw new Error(`Service secret for ${service || "<empty>"} must be at least 32 characters`);
    }
    parsed[service] = secret;
  }
  return Object.freeze(parsed);
}

export function loadConfig(): GovernanceConfig {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return {
    databaseUrl,
    kafkaBroker: process.env["KAFKA_BROKER"] ?? "localhost:9092",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    grpcPort: Number(process.env["GRPC_PORT"] ?? "50054"),
    host: process.env["HOST"] ?? "0.0.0.0",
    healthPort: Number(process.env["HEALTH_PORT"] ?? "8081"),
    catalogUrl: process.env["CATALOG_URL"] ?? "http://localhost:50052",
    catalogServiceSecret: process.env["CATALOG_SERVICE_SECRET"] ?? "",
    rbacUrl: process.env["RBAC_URL"] ?? "http://localhost:50056",
    rbacServiceSecret: process.env["RBAC_SERVICE_SECRET"] ?? "",
    serviceJwtIssuer: process.env["SERVICE_JWT_ISSUER"] ?? "owomide-internal",
    serviceSecrets: parseServiceSecrets(process.env["GOVERNANCE_SERVICE_SECRETS_JSON"] ?? "{}"),
    minioEndpoint: process.env["MINIO_ENDPOINT"] ?? "localhost:9000",
    minioAccessKey: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
    minioSecretKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    minioSecure: process.env["MINIO_SECURE"] === "true",
    minioBucket: process.env["MINIO_BUCKET"] ?? "owomide-snapshots",
    snapshotDebounceMs: Number(process.env["SNAPSHOT_DEBOUNCE_MS"] ?? "300000"),
  };
}
