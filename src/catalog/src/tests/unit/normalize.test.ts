import { describe, expect, it } from "vitest";
import { ConnectError } from "@connectrpc/connect";
import {
  normalizeCountry,
  normalizeCurrency,
  normalizeKey,
  parseAttributes,
} from "../../domain/normalize.js";

describe("canonical normalization", () => {
  it("normalizes Unicode width, whitespace, and case deterministically", () => {
    expect(normalizeKey("  ｓｋｕ－００１  ", "sku_code")).toBe("SKU-001");
  });

  it("validates currency and country codes", () => {
    expect(normalizeCurrency(" ngn ")).toBe("NGN");
    expect(normalizeCountry("gb")).toBe("GB");
    expect(() => normalizeCurrency("naira")).toThrow(ConnectError);
    expect(() => normalizeCountry("Nigeria")).toThrow(ConnectError);
  });

  it("accepts only JSON objects for flexible attributes", () => {
    expect(parseAttributes("")).toEqual({});
    expect(parseAttributes('{"brand":"Acme"}')).toEqual({ brand: "Acme" });
    expect(() => parseAttributes("[]")).toThrow(ConnectError);
    expect(() => parseAttributes("not-json")).toThrow(ConnectError);
  });
});
