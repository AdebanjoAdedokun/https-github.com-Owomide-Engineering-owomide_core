/** @import {DomainErrorEnvelope} from "./contracts.js" */

/**
 * Repository failure with the same safe envelope expected from a future
 * browser contract. Adapters throw this class; UI code handles `envelope`
 * without depending on transport status text.
 */
export class RepositoryError extends Error {
  /** @param {DomainErrorEnvelope} envelope */
  constructor(envelope) {
    super(envelope.error.message);
    this.name = "RepositoryError";
    this.envelope = envelope;
  }
}

/**
 * @param {Object} input
 * @param {string} input.code
 * @param {string} input.message
 * @param {Record<string, unknown>} [input.details]
 * @param {boolean} [input.retryable]
 * @param {string} [input.domain]
 * @param {string} input.traceId
 * @returns {DomainErrorEnvelope}
 */
export function createDomainErrorEnvelope({
  code,
  message,
  details = {},
  retryable = false,
  domain,
  traceId,
}) {
  return Object.freeze({
    error: Object.freeze({
      code,
      message,
      details: Object.freeze({ ...details }),
      retryable,
      ...(domain ? { domain } : {}),
    }),
    traceId,
  });
}

/**
 * @param {Parameters<typeof createDomainErrorEnvelope>[0]} input
 * @returns {never}
 */
export function throwRepositoryError(input) {
  throw new RepositoryError(createDomainErrorEnvelope(input));
}

/** @param {unknown} value @returns {value is RepositoryError} */
export function isRepositoryError(value) {
  return value instanceof RepositoryError;
}

/**
 * Converts an unexpected local failure into the public envelope without
 * leaking stack traces, raw fixture input, or transport implementation detail.
 *
 * @param {unknown} value
 * @param {string} traceId
 * @returns {DomainErrorEnvelope}
 */
export function toDomainErrorEnvelope(value, traceId = "fixture-unexpected") {
  if (isRepositoryError(value)) return value.envelope;
  return createDomainErrorEnvelope({
    code: "UNEXPECTED_REPOSITORY_FAILURE",
    message: "The workspace data could not be loaded.",
    retryable: false,
    details: {},
    domain: "workspace",
    traceId,
  });
}
