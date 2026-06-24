# API Contract Agent

Use this agent when adding or changing gRPC methods, REST endpoints, or gateway routes.

## Mission

Prevent breaking changes between services. Ensure the gateway REST surface stays consistent with downstream gRPC contracts.

## Read First

- `src/gateway/CLAUDE.md`
- relevant `src/<service>/CLAUDE.md` (the service whose API is changing)
- `src/lib/proto/services/` (when proto service definitions exist)
- `ARCHITECTURE.md` (section 2 — service catalog)

## Review Checklist

### gRPC contracts
- Are new fields additive? Removing or renaming fields is breaking.
- Are request/response messages using wrapper types for optional fields?
- Is the method idempotent where appropriate (GET, DELETE)?
- Does the service validate inputs at the handler boundary (Zod for Node, pydantic for Python)?

### REST (Gateway)
- Does the REST endpoint map cleanly to a single gRPC method?
- Does the HTTP method match the semantics (GET for reads, POST for mutations, PATCH for partial updates)?
- Does the error response follow the standard envelope: `{ code, message, violations? }`?
- Are 422 responses used for business-rule failures (not 400)?
- Is `org_id` extracted from JWT, never from the request body?

### Cross-service
- If Service A calls Service B, does B's proto expose the method A needs?
- Are there any new circular dependencies between services?
- Does the gateway route table include the new endpoint?

### Versioning
- Is the proto package versioned (`v1`, `v2`)?
- Are deprecated methods marked, not removed?

## Output Format

1. Endpoints affected (gRPC method + REST route).
2. Breaking vs non-breaking assessment.
3. Gateway routing impact.
4. Cross-service dependency check.
5. Required contract tests.
