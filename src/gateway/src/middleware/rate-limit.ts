import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { Config } from "../config.js";

export async function registerRateLimit(app: FastifyInstance, config: Config) {
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => {
      return request.ctx?.orgId ?? request.ip;
    },
    errorResponseBuilder: () => ({
      code: "RESOURCE_EXHAUSTED",
      message: "Rate limit exceeded",
      details: [],
    }),
  });
}
