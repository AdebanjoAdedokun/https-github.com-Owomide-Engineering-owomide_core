import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../permissions.js";
import { SUPPORT_FORBIDDEN_PERMISSIONS, isForbiddenUnderSupportAccess } from "../../support-access.js";

describe("support access limits (ORG-015)", () => {
  it("names only permissions that exist in the catalog", () => {
    const known = new Set(PERMISSIONS.map((p) => p.code));
    for (const code of SUPPORT_FORBIDDEN_PERMISSIONS) expect(known.has(code), code).toBe(true);
  });

  it("never lets support access submit, decide or record implementation", () => {
    for (const code of [
      "proposal.submit",
      "approval.approve",
      "approval.reject",
      "approval.request_changes",
      "execution.mark_implemented",
    ]) {
      expect(isForbiddenUnderSupportAccess(code), code).toBe(true);
    }
  });

  it("still allows the onboarding help support access exists for", () => {
    for (const code of ["catalogue_item.manage", "catalogue_item.read", "org_settings.read", "proposal.read"]) {
      expect(isForbiddenUnderSupportAccess(code), code).toBe(false);
    }
  });
});
