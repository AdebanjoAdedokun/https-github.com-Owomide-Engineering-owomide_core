import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { SignJWT, decodeJwt, jwtVerify } from "jose";

export interface RequestContext {
  orgId: string;
  userId?: string;
  roles: readonly string[];
}

export function requestContext(context: HandlerContext): RequestContext {
  const orgId = context.requestHeader.get("x-org-id")?.trim() ?? "";
  if (!orgId)
    throw new ConnectError("Missing authenticated organization context", Code.Unauthenticated);
  const userId = context.requestHeader.get("x-user-id")?.trim() || undefined;
  const roles = (context.requestHeader.get("x-user-roles") ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  return { orgId, userId, roles };
}

export class ServiceAuthenticator {
  constructor(
    private readonly issuer: string,
    private readonly secrets: Readonly<Record<string, string>>
  ) {}

  async authenticate(context: HandlerContext): Promise<string> {
    const authorization = context.requestHeader.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      throw new ConnectError("Missing service credential", Code.Unauthenticated);
    }
    const token = authorization.slice(7);
    let subject: string;
    try {
      const decoded = decodeJwt(token);
      subject = typeof decoded.sub === "string" ? decoded.sub : "";
    } catch {
      throw new ConnectError("Invalid service credential", Code.Unauthenticated);
    }
    const secret = this.secrets[subject];
    if (!subject || !secret) {
      throw new ConnectError("Invalid service credential", Code.Unauthenticated);
    }
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
        audience: "proposal",
        issuer: this.issuer,
        subject,
        maxTokenAge: "5m",
      });
    } catch {
      throw new ConnectError("Invalid or expired service credential", Code.Unauthenticated);
    }
    return subject;
  }

  async authorize(context: HandlerContext, allowedServices: readonly string[]): Promise<string> {
    const service = await this.authenticate(context);
    if (!allowedServices.includes(service)) {
      throw new ConnectError("Caller is not authorized for this method", Code.PermissionDenied);
    }
    return service;
  }
}

export async function signServiceJwt(
  subject: string,
  audience: string,
  secret: string,
  issuer: string
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setAudience(audience)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

export interface PermissionChecker {
  checkPermission(
    roles: readonly string[],
    permission: string,
    headers: Headers
  ): Promise<boolean>;
}

/**
 * Gate a handler on an RBAC permission. `rbacHeaders` carries the service
 * credential + x-org-id/x-user-roles for the CheckPermission call. Throws
 * PermissionDenied if the caller's roles do not grant `permission`.
 */
export async function requirePermission(
  rbac: PermissionChecker,
  rbacHeaders: Headers,
  context: RequestContext,
  permission: string
): Promise<void> {
  if (!context.userId) {
    throw new ConnectError("Authenticated user identity required", Code.Unauthenticated);
  }
  const allowed = await rbac.checkPermission(context.roles, permission, rbacHeaders);
  if (!allowed) {
    throw new ConnectError(`Permission denied: ${permission}`, Code.PermissionDenied);
  }
}
