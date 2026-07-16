import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { decodeJwt, jwtVerify } from "jose";

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

export function requireApproverRole(context: RequestContext): void {
  if (!context.userId || !context.roles.includes("approver")) {
    throw new ConnectError("Approver role required", Code.PermissionDenied);
  }
}
