export interface RequestContext {
  orgId: string;
  userId: string;
  roles: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}
