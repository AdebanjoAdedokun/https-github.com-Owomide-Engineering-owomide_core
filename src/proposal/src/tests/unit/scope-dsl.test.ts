import { describe, expect, it } from "vitest";
import { Code, ConnectError } from "@connectrpc/connect";
import { parseScopeDsl } from "../../domain/scope-dsl.js";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const OTHER_UUID = "00000000-0000-0000-0000-000000000002";

function expectInvalid(raw: string): void {
  try {
    parseScopeDsl(raw);
    throw new Error("expected ConnectError but none was thrown");
  } catch (err) {
    expect(err).toBeInstanceOf(ConnectError);
    expect((err as ConnectError).code).toBe(Code.InvalidArgument);
  }
}

describe("parseScopeDsl", () => {
  describe("valid inputs", () => {
    it("accepts minimal scope with only channel_id", () => {
      const result = parseScopeDsl(JSON.stringify({ channel_id: VALID_UUID }));
      expect(result.channel_id).toBe(VALID_UUID);
      expect(result.product_id).toBeUndefined();
      expect(result.category).toBeUndefined();
      expect(result.customer_segment_id).toBeUndefined();
      expect(result.query).toBeUndefined();
    });

    it("accepts scope with all optional fields", () => {
      const result = parseScopeDsl(
        JSON.stringify({
          channel_id: VALID_UUID,
          product_id: OTHER_UUID,
          category: "beverages",
          customer_segment_id: OTHER_UUID,
          query: "lagos",
        }),
      );
      expect(result.channel_id).toBe(VALID_UUID);
      expect(result.product_id).toBe(OTHER_UUID);
      expect(result.category).toBe("beverages");
      expect(result.customer_segment_id).toBe(OTHER_UUID);
      expect(result.query).toBe("lagos");
    });
  });

  describe("invalid inputs", () => {
    it("rejects non-JSON string", () => expectInvalid("not-json"));
    it("rejects JSON array", () => expectInvalid("[]"));
    it("rejects JSON null", () => expectInvalid("null"));
    it("rejects JSON number", () => expectInvalid("42"));
    it("rejects empty object (missing channel_id)", () => expectInvalid("{}"));
    it("rejects channel_id that is not a UUID", () =>
      expectInvalid(JSON.stringify({ channel_id: "not-a-uuid" })));
    it("rejects channel_id as a number", () =>
      expectInvalid(JSON.stringify({ channel_id: 123 })));
    it("rejects unknown field", () =>
      expectInvalid(JSON.stringify({ channel_id: VALID_UUID, tag: "promo" })));
    it("rejects product_id that is not a UUID", () =>
      expectInvalid(JSON.stringify({ channel_id: VALID_UUID, product_id: "bad" })));
    it("rejects customer_segment_id that is not a UUID", () =>
      expectInvalid(JSON.stringify({ channel_id: VALID_UUID, customer_segment_id: "bad" })));
    it("rejects category as a number", () =>
      expectInvalid(JSON.stringify({ channel_id: VALID_UUID, category: 99 })));
    it("rejects query as a boolean", () =>
      expectInvalid(JSON.stringify({ channel_id: VALID_UUID, query: true })));
  });
});
