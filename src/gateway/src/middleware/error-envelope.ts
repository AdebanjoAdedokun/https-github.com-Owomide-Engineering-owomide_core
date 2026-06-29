import type { FastifyInstance } from "fastify";
import { ConnectError, Code } from "@connectrpc/connect";

const grpcToHttp: Record<number, number> = {
  [Code.NotFound]: 404,
  [Code.InvalidArgument]: 400,
  [Code.FailedPrecondition]: 422,
  [Code.PermissionDenied]: 403,
  [Code.Unauthenticated]: 401,
  [Code.AlreadyExists]: 409,
  [Code.Unimplemented]: 501,
  [Code.Unavailable]: 503,
  [Code.DeadlineExceeded]: 504,
  [Code.ResourceExhausted]: 429,
};

export function grpcCodeToHttpStatus(code: number): number {
  return grpcToHttp[code] ?? 500;
}

export function registerErrorEnvelope(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ConnectError) {
      const status = grpcCodeToHttpStatus(error.code);
      return reply.status(status).send({
        code: Code[error.code] ?? "INTERNAL",
        message: error.message,
        details: error.details ?? [],
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Validation error",
        details: error.validation,
      });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      code: statusCode === 429 ? "RESOURCE_EXHAUSTED" : "INTERNAL",
      message: statusCode === 500 ? "Internal server error" : error.message,
      details: [],
    });
  });
}
