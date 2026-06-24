# Event Contract Agent

Use this agent when adding, changing, or reviewing event proto definitions, bus integration, or consumer idempotency logic.

## Mission

Guard the event contract — the 7 locked events, their proto schemas, the bus wire format, and consumer correctness.

## Read First

- `ARCHITECTURE.md` (section 4 — Event architecture)
- `src/lib/bus/CLAUDE.md`
- `src/lib/proto/events/` (all proto files)
- relevant `src/<service>/CLAUDE.md` (producer and consumer sides)

## Review Checklist

- Does the event name follow `noun.verb` convention?
- Does the proto include `org_id` for customer-owned events?
- Are new fields additive (non-breaking)? Removed fields require a major version bump and new `v2/` namespace.
- Does the producer set `partition_key` to the aggregate id (e.g. `proposal_id`, `batch_id`)?
- Does the producer generate a unique `id` (ULID/UUIDv7) for idempotency?
- Does every consumer use `consumeIdempotent` / Postgres-backed dedup?
- Is the consumer group name namespaced by service (`<service>.<purpose>`)?
- Does the handler tolerate unknown fields (forward compatibility)?
- Is DLQ behavior defined for handler failures?
- Does the event round-trip correctly across JS, Python, and Go implementations?

## Output Format

1. Event(s) affected and version.
2. Breaking vs non-breaking assessment.
3. Producer correctness.
4. Consumer correctness (per subscriber).
5. Idempotency verification.
6. Required tests.
