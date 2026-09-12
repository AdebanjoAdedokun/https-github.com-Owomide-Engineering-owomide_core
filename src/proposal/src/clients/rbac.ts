import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { Permission, RbacService } from "@owomide/proto/services/rbac/v1/rbac_pb.js";

export interface RbacClient {
  checkPermission(
    roles: readonly string[],
    permission: Permission,
    headers: Headers
  ): Promise<boolean>;
}

export class GrpcRbacClient implements RbacClient {
  private readonly client: ReturnType<typeof createClient<typeof RbacService>>;

  constructor(baseUrl: string) {
    this.client = createClient(RbacService, createGrpcTransport({ baseUrl }));
  }

  async checkPermission(
    roles: readonly string[],
    permission: Permission,
    headers: Headers
  ): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const res = await this.client.checkPermission!(
      { roles: [...roles], permission },
      { headers }
    );
    return res.allowed;
  }
}
