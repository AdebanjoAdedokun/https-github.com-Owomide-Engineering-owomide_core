import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  // logLevel "warn" silences the per-request info logs for this route — k8s
  // liveness/readiness probes hit /health every few seconds and would otherwise
  // flood the logs. Real errors on this route are still logged.
  app.get("/health", { logLevel: "warn" }, async (_request, reply) => {
    return reply.send({ status: "ok" });
  });
}
