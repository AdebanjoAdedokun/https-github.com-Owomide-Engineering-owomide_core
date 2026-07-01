import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import type { RequestContext } from "../context.js";

export async function registerAuth(app: FastifyInstance, config: Config) {
  const { jwtVerify, createRemoteJWKSet } = await import("jose");
  type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;
  type JwtVerifier =
    | { kind: "jwks"; key: RemoteJWKSet }
    | { kind: "secret"; key: Uint8Array };

  let verifier: JwtVerifier;

  if (config.jwksUrl) {
    verifier = {
      kind: "jwks",
      key: createRemoteJWKSet(new URL(config.jwksUrl)),
    };
  } else if (config.jwtSecret) {
    verifier = {
      kind: "secret",
      key: new TextEncoder().encode(config.jwtSecret),
    };
  } else {
    throw new Error("Either JWT_SECRET or JWKS_URL must be configured");
  }

  const verifyOptions: { issuer?: string; audience?: string } = {};
  if (config.jwtIssuer) verifyOptions.issuer = config.jwtIssuer;
  if (config.jwtAudience) verifyOptions.audience = config.jwtAudience;

  app.decorateRequest("ctx", undefined as unknown as RequestContext);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    if (request.url === "/auth/login" && request.method === "POST") return;

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
      const { payload } =
        verifier.kind === "jwks"
          ? await jwtVerify(token, verifier.key, verifyOptions)
          : await jwtVerify(token, verifier.key, verifyOptions);

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
