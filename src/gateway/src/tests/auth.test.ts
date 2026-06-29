import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { buildApp } from "../server.js";
import type { FastifyInstance } from "fastify";

const TEST_SECRET = "test-secret-that-is-long-enough-for-hs256-algorithm";

describe("auth middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = TEST_SECRET;
    const built = await buildApp();
    app = built.app;
    await app.ready();
  });

  it("allows /health without auth", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("rejects requests without Authorization header", async () => {
    const response = await app.inject({ method: "GET", url: "/proposals" });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects requests with invalid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/proposals",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects tokens missing required claims", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .sign(secret);

    const response = await app.inject({
      method: "GET",
      url: "/proposals",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts valid tokens with required claims", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ org_id: "org-1", roles: ["admin"] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .sign(secret);

    const response = await app.inject({
      method: "GET",
      url: "/imports/test",
      headers: { authorization: `Bearer ${token}` },
    });
    // 501 = data-pipeline stub, meaning auth passed
    expect(response.statusCode).toBe(501);
  });
});
