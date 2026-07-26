import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";

export interface RequestContext {
  orgId: string;
  userId: string;
}

export function requestContext(context: HandlerContext): RequestContext {
  const orgId = context.requestHeader.get("x-org-id")?.trim() ?? "";
  if (!orgId) throw new ConnectError("Missing authenticated organization context", Code.Unauthenticated);
  const userId = context.requestHeader.get("x-user-id")?.trim() ?? "";
  if (!userId) throw new ConnectError("Missing authenticated user context", Code.Unauthenticated);
  return { orgId, userId };
}
