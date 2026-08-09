import { SignJWT } from "jose";
import type { Config } from "../config.js";

export async function catalogServiceToken(config: Config): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.serviceJwtIssuer)
    .setSubject("gateway_svc")
    .setAudience("catalog")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(config.catalogGatewayServiceSecret));
}

export async function dataPipelineServiceToken(config: Config): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.serviceJwtIssuer)
    .setSubject("gateway_svc")
    .setAudience("data-pipeline")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(config.dataPipelineGatewayServiceSecret));
}

export async function marginServiceToken(config: Config): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.serviceJwtIssuer)
    .setSubject("gateway_svc")
    .setAudience("margin")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(config.marginGatewayServiceSecret));
}
