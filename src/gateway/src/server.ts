import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { registerAuth } from "./middleware/auth.js";
import { registerCors } from "./middleware/cors.js";
import { registerRateLimit } from "./middleware/rate-limit.js";
import { registerErrorEnvelope } from "./middleware/error-envelope.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProposalRoutes } from "./routes/proposals.js";
import { registerOverrideRequestRoutes } from "./routes/override-requests.js";
import { registerChangeSetRoutes } from "./routes/change-sets.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerMarginRoutes } from "./routes/margin.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerDataPipelineRoutes } from "./routes/data-pipeline.js";

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await registerCors(app, config);
  await registerAuth(app, config);
  await registerRateLimit(app, config);
  registerErrorEnvelope(app);

  await registerHealthRoutes(app);
  await registerProposalRoutes(app, config);
  await registerOverrideRequestRoutes(app, config);
  await registerChangeSetRoutes(app, config);
  await registerCatalogRoutes(app, config);
  await registerMarginRoutes(app, config);
  await registerGovernanceRoutes(app, config);
  await registerDataPipelineRoutes(app);

  return { app, config };
}

async function main() {
  const { app, config } = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isDirectRun) {
  main();
}
