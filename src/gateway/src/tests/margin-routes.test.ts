import { create } from "@bufbuild/protobuf";
import {
  ListRulesResponseSchema,
  ValidateBatchResponseSchema,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import type { RequestContext } from "../context.js";
import { registerErrorEnvelope } from "../middleware/error-envelope.js";
import { registerMarginRoutes } from "../routes/margin.js";

describe("Margin routes", () => {
  it("signs downstream calls and forwards authenticated tenant context", async () => {
    const app = Fastify();
    app.decorateRequest("ctx", undefined as unknown as RequestContext);
    app.addHook("onRequest", async (request) => {
      request.ctx = {
        orgId: "org-test",
        userId: "user-test",
        roles: ["admin", "analyst"],
      };
    });

    let capturedHeaders: Record<string, string> | undefined;
    const client = {
      async listRules(_request: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return create(ListRulesResponseSchema, {});
      },
      async validateBatch(_request: unknown, options: { headers: Record<string, string> }) {
        capturedHeaders = options.headers;
        return create(ValidateBatchResponseSchema, {});
      },
    };
    await registerMarginRoutes(app, loadConfig(), {
      client,
      token: async () => "margin-service-token",
    });

    const response = await app.inject({ method: "GET", url: "/margin/rules" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
    expect(capturedHeaders).toEqual({
      authorization: "Bearer margin-service-token",
      "x-org-id": "org-test",
      "x-user-id": "user-test",
      "x-user-roles": "admin,analyst",
    });

    await app.close();
  });

  it("returns a 400 envelope for malformed protobuf JSON", async () => {
    const app = Fastify();
    app.decorateRequest("ctx", undefined as unknown as RequestContext);
    app.addHook("onRequest", async (request) => {
      request.ctx = { orgId: "org-test", userId: "user-test", roles: [] };
    });
    registerErrorEnvelope(app);

    let called = false;
    await registerMarginRoutes(app, loadConfig(), {
      client: {
        async upsertRule() {
          called = true;
          throw new Error("should not be called");
        },
      },
      token: async () => "margin-service-token",
    });

    const response = await app.inject({
      method: "PUT",
      url: "/margin/rules",
      payload: { rule: { floorValue: "not-an-integer" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "InvalidArgument",
      message: "[invalid_argument] Invalid Margin request payload",
    });
    expect(called).toBe(false);

    await app.close();
  });
});
