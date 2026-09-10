import { describe, expect, it } from "vitest";
import { isKnownPermission } from "../../permissions.js";
import { SYSTEM_ROLE_TEMPLATES } from "../../system-role-templates.js";

const EXPECTED_ROLE_CODES = [
  "account_owner",
  "pricing_manager",
  "pricing_analyst",
  "pricing_contributor",
  "finance_approver",
  "commercial_approver",
  "executive_approver",
  "executor",
  "viewer",
  "auditor",
  "ai_assistant",
];

describe("system role templates", () => {
  it("covers exactly the 11 system roles", () => {
    expect(SYSTEM_ROLE_TEMPLATES.map((r) => r.code).sort()).toEqual([...EXPECTED_ROLE_CODES].sort());
  });

  it("every grant references a real permission in the catalog", () => {
    for (const role of SYSTEM_ROLE_TEMPLATES) {
      for (const grant of role.grants) {
        expect(isKnownPermission(grant), `${role.code} → ${grant}`).toBe(true);
      }
    }
  });

  it("no role lists a permission twice", () => {
    for (const role of SYSTEM_ROLE_TEMPLATES) {
      expect(new Set(role.grants).size, role.code).toBe(role.grants.length);
    }
  });

  it("ai_assistant is a strict subset of the invoking-user ceiling (never submit/approve/implement)", () => {
    const ai = SYSTEM_ROLE_TEMPLATES.find((r) => r.code === "ai_assistant");
    expect(ai).toBeDefined();
    for (const forbidden of [
      "proposal.submit",
      "pricing_rule.submit",
      "approval.approve",
      "override.approve",
      "execution.mark_implemented",
    ]) {
      expect(ai?.grants).not.toContain(forbidden);
    }
  });

  it("pricing_analyst cannot submit", () => {
    const analyst = SYSTEM_ROLE_TEMPLATES.find((r) => r.code === "pricing_analyst");
    expect(analyst?.grants).not.toContain("proposal.submit");
    expect(analyst?.grants).not.toContain("pricing_rule.submit");
  });
});
