import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import type { RequestContext } from "../context.js";
import { registerProposalRoutes } from "../routes/proposals.js";
import { registerChangeSetRoutes } from "../routes/change-sets.js";
import { registerOverrideRequestRoutes } from "../routes/override-requests.js";

function contextHook(app: FastifyInstance) {
  app.decorateRequest("ctx", undefined as unknown as RequestContext);
  app.addHook("onRequest", async (request: FastifyRequest) => {
    request.ctx = { orgId: "org-test", userId: "user-test", roles: ["pricing_manager"] };
  });
}

const expectedHeaders = {
  authorization: "Bearer proposal-service-token",
  "x-org-id": "org-test",
  "x-user-id": "user-test",
  "x-user-roles": "pricing_manager",
};

// Regression test for the bug this PR closes: proposals.ts, change-sets.ts and
// override-requests.ts previously dropped x-user-roles and never set an
// authorization header at all, so every real call into Proposal 401'd and no
// RBAC check downstream could ever see the caller's roles.
describe("Proposal-owned routes forward roles and a service credential", () => {
  it("proposals.ts", async () => {
    const app = Fastify();
    contextHook(app);
    let capturedHeaders: Record<string, string> | undefined;
    const client = {
      async getProposal(_req: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return {};
      },
    };
    await registerProposalRoutes(app, loadConfig(), {
      client,
      token: async () => "proposal-service-token",
    });

    const response = await app.inject({ method: "GET", url: "/proposals/some-id" });
    expect(response.statusCode).toBe(200);
    expect(capturedHeaders).toEqual(expectedHeaders);
    await app.close();
  });

  it("change-sets.ts", async () => {
    const app = Fastify();
    contextHook(app);
    let capturedHeaders: Record<string, string> | undefined;
    const client = {
      async getChangeSet(_req: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return {};
      },
    };
    await registerChangeSetRoutes(app, loadConfig(), {
      client,
      token: async () => "proposal-service-token",
    });

    const response = await app.inject({ method: "GET", url: "/change-sets/some-id" });
    expect(response.statusCode).toBe(200);
    expect(capturedHeaders).toEqual(expectedHeaders);
    await app.close();
  });

  it("override-requests.ts", async () => {
    const app = Fastify();
    contextHook(app);
    let capturedHeaders: Record<string, string> | undefined;
    const client = {
      async approveOverride(_req: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return {};
      },
    };
    await registerOverrideRequestRoutes(app, loadConfig(), {
      client,
      token: async () => "proposal-service-token",
    });

    const response = await app.inject({ method: "POST", url: "/override-requests/some-id/approve" });
    expect(response.statusCode).toBe(200);
    expect(capturedHeaders).toEqual(expectedHeaders);
    await app.close();
  });
});
