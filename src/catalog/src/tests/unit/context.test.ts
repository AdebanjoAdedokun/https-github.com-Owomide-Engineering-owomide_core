import { describe, expect, it } from "vitest";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { SignJWT } from "jose";
import { requestContext, ServiceAuthenticator } from "../../context.js";

const secret = "catalog-test-secret-that-is-at-least-32-characters";

function context(headers: Record<string, string>): HandlerContext {
  return { requestHeader: new Headers(headers) } as HandlerContext;
}

async function token(subject: string, audience = "catalog"): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("owomide-internal")
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(secret));
}

describe("request and service authentication", () => {
  const authenticator = new ServiceAuthenticator("owomide-internal", { gateway_svc: secret });

  it("derives organization and roles from authenticated metadata", () => {
    expect(
      requestContext(
        context({
          "x-org-id": "org-a",
          "x-user-id": "user-a",
          "x-user-roles": "admin, analyst",
        })
      )
    ).toEqual({ orgId: "org-a", userId: "user-a", roles: ["admin", "analyst"] });
  });

  it("verifies issuer, audience, subject, and signature", async () => {
    const valid = await token("gateway_svc");
    await expect(
      authenticator.authorize(context({ authorization: `Bearer ${valid}` }), ["gateway_svc"])
    ).resolves.toBe("gateway_svc");
    const wrongAudience = await token("gateway_svc", "proposal");
    await expect(
      authenticator.authenticate(context({ authorization: `Bearer ${wrongAudience}` }))
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
  });

  it("does not trust x-service-id without a credential", async () => {
    await expect(
      authenticator.authenticate(context({ "x-service-id": "gateway_svc" }))
    ).rejects.toBeInstanceOf(ConnectError);
  });
});
