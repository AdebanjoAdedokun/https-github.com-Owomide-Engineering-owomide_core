export interface GovernanceConfig {
  databaseUrl: string;
  kafkaBroker: string;
  logLevel: string;
  healthPort: number;
  catalogUrl: string;
  catalogServiceSecret: string;
  serviceJwtIssuer: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioSecure: boolean;
  minioBucket: string;
  snapshotDebounceMs: number;
}

export function loadConfig(): GovernanceConfig {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return {
    databaseUrl,
    kafkaBroker: process.env["KAFKA_BROKER"] ?? "localhost:9092",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    healthPort: Number(process.env["HEALTH_PORT"] ?? "8081"),
    catalogUrl: process.env["CATALOG_URL"] ?? "http://localhost:50052",
    catalogServiceSecret: process.env["CATALOG_SERVICE_SECRET"] ?? "",
    serviceJwtIssuer: process.env["SERVICE_JWT_ISSUER"] ?? "owomide-internal",
    minioEndpoint: process.env["MINIO_ENDPOINT"] ?? "localhost:9000",
    minioAccessKey: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
    minioSecretKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    minioSecure: process.env["MINIO_SECURE"] === "true",
    minioBucket: process.env["MINIO_BUCKET"] ?? "owomide-snapshots",
    snapshotDebounceMs: Number(process.env["SNAPSHOT_DEBOUNCE_MS"] ?? "300000"),
  };
}
