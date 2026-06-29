import { describe, it, expect } from "vitest";
import { Code } from "@connectrpc/connect";
import { grpcCodeToHttpStatus } from "../middleware/error-envelope.js";

describe("error envelope", () => {
  it("maps NOT_FOUND to 404", () => {
    expect(grpcCodeToHttpStatus(Code.NotFound)).toBe(404);
  });

  it("maps INVALID_ARGUMENT to 400", () => {
    expect(grpcCodeToHttpStatus(Code.InvalidArgument)).toBe(400);
  });

  it("maps FAILED_PRECONDITION to 422", () => {
    expect(grpcCodeToHttpStatus(Code.FailedPrecondition)).toBe(422);
  });

  it("maps PERMISSION_DENIED to 403", () => {
    expect(grpcCodeToHttpStatus(Code.PermissionDenied)).toBe(403);
  });

  it("maps UNAUTHENTICATED to 401", () => {
    expect(grpcCodeToHttpStatus(Code.Unauthenticated)).toBe(401);
  });

  it("maps ALREADY_EXISTS to 409", () => {
    expect(grpcCodeToHttpStatus(Code.AlreadyExists)).toBe(409);
  });

  it("maps UNAVAILABLE to 503", () => {
    expect(grpcCodeToHttpStatus(Code.Unavailable)).toBe(503);
  });

  it("maps unknown codes to 500", () => {
    expect(grpcCodeToHttpStatus(99)).toBe(500);
  });
});
