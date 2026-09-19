import { describe, expect, it } from "vitest";
import { Permission } from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import { CODE_BY_PERMISSION, PERMISSIONS, isKnownPermission } from "../../permissions.js";

describe("CODE_BY_PERMISSION (generated enum -> catalog string)", () => {
  it("has exactly one entry per non-UNSPECIFIED enum value, matching PERMISSIONS 1:1", () => {
    const enumValues = Object.values(Permission).filter(
      (v): v is number => typeof v === "number" && v !== Permission.UNSPECIFIED
    );
    expect(enumValues).toHaveLength(PERMISSIONS.length);
    expect(Object.keys(CODE_BY_PERMISSION)).toHaveLength(PERMISSIONS.length);
    for (const value of enumValues) {
      const code = CODE_BY_PERMISSION[value];
      expect(code, `enum value ${value}`).toBeDefined();
      expect(isKnownPermission(code!)).toBe(true);
    }
  });

  it("every PERMISSIONS code is reachable from some enum value", () => {
    const reachable = new Set(Object.values(CODE_BY_PERMISSION));
    for (const p of PERMISSIONS) {
      expect(reachable.has(p.code), p.code).toBe(true);
    }
  });

  it("spot-checks a few well-known mappings", () => {
    expect(CODE_BY_PERMISSION[Permission.PROPOSAL_SUBMIT]).toBe("proposal.submit");
    expect(CODE_BY_PERMISSION[Permission.APPROVAL_APPROVE]).toBe("approval.approve");
    expect(CODE_BY_PERMISSION[Permission.PLATFORM_RESTORE]).toBe("platform.restore");
    expect(CODE_BY_PERMISSION[Permission.MARGIN_GUARDRAIL_MANAGE]).toBe("margin_guardrail.manage");
  });
});
