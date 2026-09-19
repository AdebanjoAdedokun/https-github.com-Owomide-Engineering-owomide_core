import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import type { RequestContext } from "../context.js";
import { registerGovernanceRoutes } from "../routes/governance.js";

// Regression test for the bug this PR closes: governance.ts previously dropped
// x-user-roles and never set an authorization header, so Governance's restore
// endpoint — which executes immediately and mutates Catalog data — could not
// have received a role to check even after the service-side gate was added.
describe("Governance routes forward roles and a service credential", () => {
  it("forwards authorization + x-user-roles on restore", async () => {
    const app = Fastify();
    app.decorateRequest("ctx", undefined as unknown as RequestContext);
    app.addHook("onRequest", async (request) => {
      request.ctx = { orgId: "org-test", userId: "user-test", roles: ["account_owner"] };
    });

    let capturedHeaders: Record<string, string> | undefined;
    const client = {
      async restore(_req: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return {};
      },
    };
    await registerGovernanceRoutes(app, loadConfig(), {
      client,
      token: async () => "governance-service-token",
    });

    const response = await app.inject({ method: "POST", url: "/governance/restore", payload: {} });

    expect(response.statusCode).toBe(200);
    expect(capturedHeaders).toEqual({
      authorization: "Bearer governance-service-token",
      "x-org-id": "org-test",
      "x-user-id": "user-test",
      "x-user-roles": "account_owner",
    });

    await app.close();
  });
});
