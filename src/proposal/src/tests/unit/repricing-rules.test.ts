import { describe, expect, it } from "vitest";
import { Code, ConnectError } from "@connectrpc/connect";
import { parseRepricingRule, applyRule, RuleType } from "../../domain/repricing-rules.js";

function catches(fn: () => unknown): unknown {
  try { fn(); return undefined; } catch (e) { return e; }
}

function isConnectError(code: Code) {
  return (err: unknown) => err instanceof ConnectError && err.code === code;
}

describe("parseRepricingRule", () => {
  describe("valid rules", () => {
    it("parses pct_increase", () => {
      const rule = parseRepricingRule(JSON.stringify({ type: "pct_increase", value: 5 }));
      expect(rule).toEqual({ type: RuleType.PctIncrease, value: 5 });
    });

    it("parses pct_decrease", () => {
      const rule = parseRepricingRule(JSON.stringify({ type: "pct_decrease", value: 10 }));
      expect(rule).toEqual({ type: RuleType.PctDecrease, value: 10 });
    });

    it("parses absolute_increase", () => {
      const rule = parseRepricingRule(JSON.stringify({ type: "absolute_increase", amount_minor: 5000, currency: "NGN" }));
      expect(rule).toEqual({ type: RuleType.AbsoluteIncrease, amount_minor: 5000n, currency: "NGN" });
    });

    it("parses absolute_decrease", () => {
      const rule = parseRepricingRule(JSON.stringify({ type: "absolute_decrease", amount_minor: 1000, currency: "USD" }));
      expect(rule).toEqual({ type: RuleType.AbsoluteDecrease, amount_minor: 1000n, currency: "USD" });
    });
  });

  describe("invalid input", () => {
    it("rejects non-JSON input", () => {
      expect(catches(() => parseRepricingRule("not-json"))).toSatisfy(isConnectError(Code.InvalidArgument));
    });

    it("rejects unknown type", () => {
      expect(catches(() => parseRepricingRule(JSON.stringify({ type: "fixed", value: 100 })))).toSatisfy(
        isConnectError(Code.InvalidArgument),
      );
    });

    it("rejects pct_increase with value = 0", () => {
      expect(catches(() => parseRepricingRule(JSON.stringify({ type: "pct_increase", value: 0 })))).toSatisfy(
        isConnectError(Code.InvalidArgument),
      );
    });

    it("rejects pct_decrease with value > 100", () => {
      expect(catches(() => parseRepricingRule(JSON.stringify({ type: "pct_decrease", value: 101 })))).toSatisfy(
        isConnectError(Code.InvalidArgument),
      );
    });

    it("rejects absolute rule with invalid currency", () => {
      expect(
        catches(() => parseRepricingRule(JSON.stringify({ type: "absolute_increase", amount_minor: 500, currency: "ng" }))),
      ).toSatisfy(isConnectError(Code.InvalidArgument));
    });

    it("rejects absolute rule with non-positive amount_minor", () => {
      expect(
        catches(() => parseRepricingRule(JSON.stringify({ type: "absolute_increase", amount_minor: 0, currency: "NGN" }))),
      ).toSatisfy(isConnectError(Code.InvalidArgument));
    });
  });
});

describe("applyRule", () => {
  it("applies pct_increase 5% to 100000n → 105000n", () => {
    const rule = parseRepricingRule(JSON.stringify({ type: "pct_increase", value: 5 }));
    expect(applyRule(rule, 100000n, "NGN")).toBe(105000n);
  });

  it("applies pct_decrease 10% to 100000n → 90000n", () => {
    const rule = parseRepricingRule(JSON.stringify({ type: "pct_decrease", value: 10 }));
    expect(applyRule(rule, 100000n, "NGN")).toBe(90000n);
  });

  it("applies absolute_increase 5000 to 100000n NGN → 105000n", () => {
    const rule = parseRepricingRule(JSON.stringify({ type: "absolute_increase", amount_minor: 5000, currency: "NGN" }));
    expect(applyRule(rule, 100000n, "NGN")).toBe(105000n);
  });

  it("throws FailedPrecondition when result ≤ 0 (pct_decrease 100%)", () => {
    const rule = parseRepricingRule(JSON.stringify({ type: "pct_decrease", value: 100 }));
    expect(catches(() => applyRule(rule, 100000n, "NGN"))).toSatisfy(isConnectError(Code.FailedPrecondition));
  });

  it("throws InvalidArgument on currency mismatch for absolute rule", () => {
    const rule = parseRepricingRule(JSON.stringify({ type: "absolute_increase", amount_minor: 5000, currency: "USD" }));
    expect(catches(() => applyRule(rule, 100000n, "NGN"))).toSatisfy(isConnectError(Code.InvalidArgument));
  });
});
