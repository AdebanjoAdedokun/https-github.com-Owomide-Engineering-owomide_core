import { describe, expect, it } from "vitest";
import { PERMISSIONS, isKnownPermission } from "../../permissions.js";

describe("permission catalog", () => {
  it("has the expected 55 entries", () => {
    expect(PERMISSIONS).toHaveLength(55);
  });

  it("has no duplicate codes", () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("codes are exactly resource.action", () => {
    for (const p of PERMISSIONS) {
      expect(p.code).toBe(`${p.resource}.${p.action}`);
    }
  });

  it("every entry has a non-empty description and category", () => {
    for (const p of PERMISSIONS) {
      expect(p.description.trim().length).toBeGreaterThan(0);
      expect(p.category.trim().length).toBeGreaterThan(0);
    }
  });

  it("isKnownPermission accepts catalog codes and rejects others", () => {
    expect(isKnownPermission("proposal.submit")).toBe(true);
    expect(isKnownPermission("platform.restore")).toBe(true);
    expect(isKnownPermission("proposal.launch_nukes")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });
});
