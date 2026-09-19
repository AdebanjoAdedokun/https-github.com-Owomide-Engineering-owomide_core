import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type CallOptions } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { SignJWT } from "jose";
import {
  CheckPermissionRequestSchema,
  Permission,
  RbacService,
  type CheckPermissionResponse,
} from "@owomide/proto/services/rbac/v1/rbac_pb.js";

export interface RbacClient {
  checkPermission(roles: readonly string[], permission: Permission, headers: Headers): Promise<boolean>;
}

// RbacService currently has exactly one RPC. Bazel's pinned TypeScript
// (5.7.2) fails to resolve @connectrpc/connect's Client<> mapped type for a
// single-method service — the generic conditional chain that distinguishes
// unary/streaming methods collapses to a union instead of the unary
// signature, even though the same pattern works for every other (multi-
// method) generated client in this codebase, and even though local dev's
// newer tsc (5.9.3) resolves it fine. Sidestep it with an explicit type
// instead of relying on that inference.
type CheckPermissionFn = (
  request: MessageInitShape<typeof CheckPermissionRequestSchema>,
  options?: CallOptions
) => Promise<CheckPermissionResponse>;

export class GrpcRbacClient implements RbacClient {
  private readonly checkPermissionFn: CheckPermissionFn;

  constructor(
    baseUrl: string,
    private readonly secret: string,
    private readonly issuer: string
  ) {
    const client = createClient(RbacService, createGrpcTransport({ baseUrl }));
    this.checkPermissionFn = client.checkPermission as unknown as CheckPermissionFn;
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
    const request = create(CheckPermissionRequestSchema, { roles: [...roles], permission });
    const res = await this.checkPermissionFn(request, { headers });
    return res.allowed;
  }
}
