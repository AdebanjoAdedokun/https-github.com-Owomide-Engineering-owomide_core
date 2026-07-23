import { describe, expect, it } from "vitest";
import { computeDiff } from "../../domain/diff.js";

describe("computeDiff", () => {
  it("computes 5% increase correctly", () => {
    const diff = computeDiff(100000n, 105000n, "NGN");
    expect(diff.diffPct).toBe(5.0);
    expect(diff.diffAbsoluteMinor).toBe(5000n);
    expect(diff.diffAbsoluteCurrency).toBe("NGN");
  });

  it("computes 10% decrease correctly", () => {
    const diff = computeDiff(100000n, 90000n, "NGN");
    expect(diff.diffPct).toBe(-10.0);
    expect(diff.diffAbsoluteMinor).toBe(-10000n);
    expect(diff.diffAbsoluteCurrency).toBe("NGN");
  });

  it("returns diffPct = 0 when current price is zero", () => {
    const diff = computeDiff(0n, 5000n, "NGN");
    expect(diff.diffPct).toBe(0);
    expect(diff.diffAbsoluteMinor).toBe(5000n);
  });
});
