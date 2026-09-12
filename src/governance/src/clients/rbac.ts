import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { SignJWT } from "jose";
import { Permission, RbacService } from "@owomide/proto/services/rbac/v1/rbac_pb.js";

export interface RbacClient {
  checkPermission(roles: readonly string[], permission: Permission, headers: Headers): Promise<boolean>;
}

export class GrpcRbacClient implements RbacClient {
  private readonly client: ReturnType<typeof createClient<typeof RbacService>>;

  constructor(
    baseUrl: string,
    private readonly secret: string,
    private readonly issuer: string
  ) {
    this.client = createClient(RbacService, createGrpcTransport({ baseUrl }));
  }

  async checkPermission(
    roles: readonly string[],
    permission: Permission,
    headers: Headers
  ): Promise<boolean> {
    if (this.secret) {
      const jwt = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("governance_svc")
        .setAudience("rbac")
        .setIssuer(this.issuer)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(this.secret));
      headers.set("Authorization", `Bearer ${jwt}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const res = await this.client.checkPermission!({ roles: [...roles], permission }, { headers });
    return res.allowed;
  }
}
