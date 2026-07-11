import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../server.js";
import type { FastifyInstance } from "fastify";

const TEST_SECRET = "test-secret-that-is-long-enough-for-hs256-algorithm";

describe("POST /auth/login", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = TEST_SECRET;
    process.env["DEV_USER_EMAIL"] = "dev@owomide.local";
    process.env["DEV_USER_PASSWORD"] = "dev";
    process.env["DEV_USER_ORG_ID"] = "org-dev";
    process.env["DEV_USER_ID"] = "user-dev";
    process.env["DEV_USER_ROLES"] = "admin";
    delete process.env["JWKS_URL"];
    const built = await buildApp();
    app = built.app;
    await app.ready();
  });

  it("returns a token for valid credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "dev@owomide.local", password: "dev" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(typeof body.expiresIn).toBe("number");
  });

  it("rejects wrong password with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "dev@owomide.local", password: "wrong" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects unknown email with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "other@example.com", password: "dev" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects malformed body with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "not-an-email" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("BAD_REQUEST");
  });

  it("round-trip: issued token is accepted by the verify hook", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "dev@owomide.local", password: "dev" },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token } = loginRes.json();

    // /mappings/test returns 501 (deferred Data Pipeline route), meaning auth passed
    const protectedRes = await app.inject({
      method: "GET",
      url: "/mappings/test",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(protectedRes.statusCode).toBe(501);
  });
});

describe("POST /auth/login — JWKS mode (no jwtSecret)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    delete process.env["JWT_SECRET"];
    process.env["JWKS_URL"] = "https://example.com/.well-known/jwks.json";
    const built = await buildApp();
    app = built.app;
    await app.ready();
  });

  it("returns 501 when only JWKS is configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: "dev@owomide.local", password: "dev" },
    });
    expect(response.statusCode).toBe(501);
    expect(response.json().code).toBe("NOT_IMPLEMENTED");
  });
});
