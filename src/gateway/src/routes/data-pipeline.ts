import type { FastifyInstance } from "fastify";

const STUB_RESPONSE = {
  code: "UNIMPLEMENTED",
  message: "Data Pipeline routes are not yet implemented",
  details: [],
};

export async function registerDataPipelineRoutes(app: FastifyInstance) {
  const prefixes = ["/imports", "/mappings", "/exports", "/intelligence"];

  for (const prefix of prefixes) {
    app.all(`${prefix}`, async (_req, reply) => {
      return reply.status(501).send(STUB_RESPONSE);
    });
    app.all(`${prefix}/*`, async (_req, reply) => {
      return reply.status(501).send(STUB_RESPONSE);
    });
  }
}
