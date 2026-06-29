import type { FastifyInstance } from "fastify";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { JWTVerifyGetKey } from "jose";
import type { Config } from "../config.js";
import type { RequestContext } from "../context.js";

export async function registerAuth(app: FastifyInstance, config: Config) {
  let keyOrJwks: Uint8Array | JWTVerifyGetKey;

  if (config.jwksUrl) {
    keyOrJwks = createRemoteJWKSet(new URL(config.jwksUrl));
  } else if (config.jwtSecret) {
    keyOrJwks = new TextEncoder().encode(config.jwtSecret);
  } else {
    throw new Error("Either JWT_SECRET or JWKS_URL must be configured");
  }

  const verifyOptions: { issuer?: string; audience?: string } = {};
  if (config.jwtIssuer) verifyOptions.issuer = config.jwtIssuer;
  if (config.jwtAudience) verifyOptions.audience = config.jwtAudience;

  app.decorateRequest("ctx", undefined as unknown as RequestContext);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Missing or malformed Authorization header",
        details: [],
      });
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtVerify(token, keyOrJwks, verifyOptions);

      const orgId = payload["org_id"];
      const userId = payload["sub"];
      const roles = payload["roles"];

      if (typeof orgId !== "string" || typeof userId !== "string") {
        return reply.status(401).send({
          code: "UNAUTHENTICATED",
          message: "Token missing required claims: org_id, sub",
          details: [],
        });
      }

      request.ctx = {
        orgId,
        userId,
        roles: Array.isArray(roles) ? roles as string[] : [],
      };
    } catch {
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Invalid or expired token",
        details: [],
      });
    }
  });
}
