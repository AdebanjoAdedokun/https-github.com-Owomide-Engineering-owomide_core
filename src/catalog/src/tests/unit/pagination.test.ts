import { describe, expect, it } from "vitest";
import { ConnectError } from "@connectrpc/connect";
import { decodeCursor, encodeCursor, pageSize } from "../../domain/pagination.js";

describe("cursor pagination", () => {
  it("round trips an opaque cursor", () => {
    const cursor = { key: "SKU-100", id: "42e49ff4-2892-4876-981e-8f1b17cb2f35" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("uses bounded page sizes", () => {
    expect(pageSize(0)).toBe(50);
    expect(pageSize(500)).toBe(200);
    expect(() => pageSize(-1)).toThrow(ConnectError);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(ConnectError);
  });
});
