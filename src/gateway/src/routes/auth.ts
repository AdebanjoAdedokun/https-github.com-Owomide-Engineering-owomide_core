import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance, config: Config) {
  const { SignJWT } = await import("jose");

  app.post("/auth/login", { logLevel: "warn" }, async (request, reply) => {
    if (!config.jwtSecret) {
      return reply.status(501).send({
        code: "NOT_IMPLEMENTED",
        message: "Token issuance not supported in JWKS mode",
        details: [],
      });
    }

    const body = LoginBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        code: "BAD_REQUEST",
        message: "Invalid request body",
        details: body.error.issues,
      });
    }

    const { email, password } = body.data;

    if (email !== config.devUserEmail || password !== config.devUserPassword) {
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Invalid credentials",
        details: [],
      });
    }

    const secret = new TextEncoder().encode(config.jwtSecret);
    const jwt = new SignJWT({ org_id: config.devUserOrgId, roles: config.devUserRoles })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(config.devUserId)
      .setExpirationTime(Math.floor(Date.now() / 1000) + config.jwtExpiresIn);

    if (config.jwtIssuer) jwt.setIssuer(config.jwtIssuer);
    if (config.jwtAudience) jwt.setAudience(config.jwtAudience);

    const token = await jwt.sign(secret);

    return reply.send({ token, expiresIn: config.jwtExpiresIn });
  });
}
