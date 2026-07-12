import { create } from "@bufbuild/protobuf";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { SaveChannelResponseSchema } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { loadConfig } from "../config.js";
import type { RequestContext } from "../context.js";
import { registerCatalogRoutes } from "../routes/catalog.js";

describe("Catalog routes", () => {
  it("serializes protobuf timestamps to JSON instead of leaking bigint values", async () => {
    const app = Fastify();
    app.decorateRequest("ctx", undefined as unknown as RequestContext);
    app.addHook("onRequest", async (request) => {
      request.ctx = { orgId: "org-test", userId: "user-test", roles: ["admin"] };
    });

    let capturedHeaders: Headers | undefined;
    const client = {
      async saveChannel(_request: unknown, options: { headers: Headers }) {
        capturedHeaders = options.headers;
        return create(SaveChannelResponseSchema, {
          channel: {
            id: "channel-1",
            orgId: "org-test",
            code: "retail",
            name: "Retail",
            defaultCurrency: "NGN",
            attributesJson: "{}",
            createdAt: { seconds: 0n },
            updatedAt: { seconds: 1n },
          },
        });
      },
    };
    await registerCatalogRoutes(app, loadConfig(), {
      client,
      token: async () => "service-token",
    });

    const response = await app.inject({
      method: "POST",
      url: "/catalog/channels",
      payload: {
        code: "retail",
        name: "Retail",
        defaultCurrency: "NGN",
        attributesJson: "{}",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      channel: {
        id: "channel-1",
        createdAt: "1970-01-01T00:00:00Z",
        updatedAt: "1970-01-01T00:00:01Z",
      },
    });
    expect(capturedHeaders).toMatchObject({
      authorization: "Bearer service-token",
      "x-org-id": "org-test",
      "x-user-id": "user-test",
      "x-user-roles": "admin",
    });

    await app.close();
  });
});
