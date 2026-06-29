import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),

  proposalServiceUrl: z.string().default("http://localhost:50051"),
  catalogServiceUrl: z.string().default("http://localhost:50052"),
  marginServiceUrl: z.string().default("http://localhost:50053"),
  governanceServiceUrl: z.string().default("http://localhost:50054"),
  dataPipelineServiceUrl: z.string().default("http://localhost:50055"),

  jwtSecret: z.string().optional(),
  jwksUrl: z.string().optional(),
  jwtIssuer: z.string().optional(),
  jwtAudience: z.string().optional(),

  rateLimitMax: z.coerce.number().default(100),
  rateLimitWindowMs: z.coerce.number().default(60_000),

  corsOrigin: z.string().default("*"),

  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env["PORT"],
    host: process.env["HOST"],

    proposalServiceUrl: process.env["PROPOSAL_SERVICE_URL"],
    catalogServiceUrl: process.env["CATALOG_SERVICE_URL"],
    marginServiceUrl: process.env["MARGIN_SERVICE_URL"],
    governanceServiceUrl: process.env["GOVERNANCE_SERVICE_URL"],
    dataPipelineServiceUrl: process.env["DATA_PIPELINE_SERVICE_URL"],

    jwtSecret: process.env["JWT_SECRET"],
    jwksUrl: process.env["JWKS_URL"],
    jwtIssuer: process.env["JWT_ISSUER"],
    jwtAudience: process.env["JWT_AUDIENCE"],

    rateLimitMax: process.env["RATE_LIMIT_MAX"],
    rateLimitWindowMs: process.env["RATE_LIMIT_WINDOW_MS"],

    corsOrigin: process.env["CORS_ORIGIN"],

    logLevel: process.env["LOG_LEVEL"],
  });
}
