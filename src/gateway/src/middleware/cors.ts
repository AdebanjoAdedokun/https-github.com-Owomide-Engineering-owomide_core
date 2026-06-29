import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Config } from "../config.js";

export async function registerCors(app: FastifyInstance, config: Config) {
  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
}
