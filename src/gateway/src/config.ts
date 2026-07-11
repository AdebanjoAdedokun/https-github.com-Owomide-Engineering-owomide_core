import { z } from "zod";

const ConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),

  proposalServiceUrl: z.string().default("http://localhost:50051"),
  catalogServiceUrl: z.string().default("http://localhost:50052"),
  marginServiceUrl: z.string().default("http://localhost:50053"),
  governanceServiceUrl: z.string().default("http://localhost:50054"),
  dataPipelineServiceUrl: z.string().default("http://localhost:50055"),
  serviceJwtIssuer: z.string().default("owomide-internal"),
  catalogGatewayServiceSecret: z.string().min(32),
  dataPipelineGatewayServiceSecret: z.string().min(32),
  dataPipelineUploadMaxBytes: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),

  jwtSecret: z.string().optional(),
  jwksUrl: z.string().optional(),
  jwtIssuer: z.string().optional(),
  jwtAudience: z.string().optional(),
  jwtExpiresIn: z.coerce.number().default(3600),

  devUserEmail: z.string().default("dev@owomide.local"),
  devUserPassword: z.string().default("dev"),
  devUserOrgId: z.string().default("org-dev"),
  devUserId: z.string().default("user-dev"),
  devUserRoles: z
    .string()
    .default("admin")
    .transform((s) => s.split(",").map((r) => r.trim())),

  rateLimitMax: z.coerce.number().default(100),
  rateLimitWindowMs: z.coerce.number().default(60_000),

  corsOrigin: z.string().default("*"),

  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const catalogGatewayServiceSecret =
    process.env["CATALOG_GATEWAY_SERVICE_SECRET"] ??
    (nodeEnv === "production" ? undefined : "dev-only-catalog-gateway-secret-change-me");
  const dataPipelineGatewayServiceSecret =
    process.env["DATA_PIPELINE_GATEWAY_SERVICE_SECRET"] ??
    (nodeEnv === "production" ? undefined : "dev-only-data-pipeline-gateway-secret-change-me");
  return ConfigSchema.parse({
    nodeEnv,
    port: process.env["PORT"],
    host: process.env["HOST"],

    proposalServiceUrl: process.env["PROPOSAL_SERVICE_URL"],
    catalogServiceUrl: process.env["CATALOG_SERVICE_URL"],
    marginServiceUrl: process.env["MARGIN_SERVICE_URL"],
    governanceServiceUrl: process.env["GOVERNANCE_SERVICE_URL"],
    dataPipelineServiceUrl: process.env["DATA_PIPELINE_SERVICE_URL"],
    serviceJwtIssuer: process.env["SERVICE_JWT_ISSUER"],
    catalogGatewayServiceSecret,
    dataPipelineGatewayServiceSecret,
    dataPipelineUploadMaxBytes: process.env["DATA_PIPELINE_UPLOAD_MAX_BYTES"],

    jwtSecret: process.env["JWT_SECRET"],
    jwksUrl: process.env["JWKS_URL"],
    jwtIssuer: process.env["JWT_ISSUER"],
    jwtAudience: process.env["JWT_AUDIENCE"],
    jwtExpiresIn: process.env["JWT_EXPIRES_IN"],

    devUserEmail: process.env["DEV_USER_EMAIL"],
    devUserPassword: process.env["DEV_USER_PASSWORD"],
    devUserOrgId: process.env["DEV_USER_ORG_ID"],
    devUserId: process.env["DEV_USER_ID"],
    devUserRoles: process.env["DEV_USER_ROLES"],

    rateLimitMax: process.env["RATE_LIMIT_MAX"],
    rateLimitWindowMs: process.env["RATE_LIMIT_WINDOW_MS"],

    corsOrigin: process.env["CORS_ORIGIN"],

    logLevel: process.env["LOG_LEVEL"],
  });
}
