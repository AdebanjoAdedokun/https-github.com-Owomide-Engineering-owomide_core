# src/lib/bus

The provider-agnostic event bus library. **Three native implementations — Node.js, Python, Go — under one shared contract and one wire format.**

This package is the abstraction between application code and whatever transport carries events today (Redis Streams) or tomorrow (Kafka). No service ever imports a provider client directly. Services import their language's bus binding, get a `Publisher` and `Subscriber`, and don't know — and don't care — what's underneath.

That portability is the entire point. We run lean on Redis Streams for MVP. We switch to Kafka the day the numbers say we have to. We let each service pick the language that fits its problem. **None of those moves requires changing event schemas, wire format, or any consumer's idempotency logic.**

---

## Layout

```
src/lib/bus/
├── CLAUDE.md           ← this file (shared contract for all three impls)
├── BUILD.bazel
├── js/                 ← Node.js / TypeScript implementation
│   ├── src/
│   │   ├── index.ts            (public API)
│   │   ├── envelope.ts         (wire serialization)
│   │   ├── consume-idempotent.ts
│   │   ├── providers/
│   │   │   ├── redis-streams.ts
│   │   │   └── kafka.ts        (stub)
│   │   └── tests/
│   ├── package.json
│   └── BUILD.bazel
├── py/                 ← Python implementation
│   ├── owomide_bus/
│   │   ├── __init__.py
│   │   ├── envelope.py
│   │   ├── consume_idempotent.py
│   │   ├── providers/
│   │   │   ├── redis_streams.py
│   │   │   └── kafka.py        (stub)
│   │   └── tests/
│   ├── pyproject.toml
│   └── BUILD.bazel
└── go/                 ← Go implementation (built when first Go service lands)
    ├── pkg/bus/
    │   ├── bus.go              (public API)
    │   ├── envelope.go
    │   ├── consume_idempotent.go
    │   ├── providers/
    │   │   ├── redisstreams.go
    │   │   └── kafka.go        (stub)
    │   └── *_test.go
    ├── go.mod
    └── BUILD.bazel
```

**Build order:**
- **F0.5 (Phase 0):** `js/` and `py/`. These cover every MVP service.
- **When the first Go service lands** (post-MVP, likely Phase 6 or later): `go/`. Contract is locked by then, so building the Go implementation is mechanical.

The Go subfolder exists with a `README` stub from day one so the seam is visible.

---

## The shared contract

Every implementation exposes the same five concepts. Names follow each language's idioms, but the *shape* is identical.

### Event

The envelope every event carries:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string (ULID / UUIDv7) | yes | Idempotency key — consumers dedupe by this |
| `type` | string | yes | Dotted name, e.g. `proposal.submitted` |
| `occurred_at` | ISO-8601 string (UTC) | yes | When the event happened |
| `partition_key` | string | recommended | Aggregate id (e.g. `proposal_id`). Kafka uses this for ordering; Redis Streams currently ignores it but having it set keeps us forward-compatible. |
| `payload` | protobuf-encoded bytes | yes | Schema lives in `src/lib/proto/events/` |
| `metadata.trace_id` | string | optional | OpenTelemetry trace context |
| `metadata.span_id` | string | optional | OpenTelemetry span |
| `metadata.actor_id` | string | optional | Who caused this event |
| `metadata.correlation_id` | string | optional | Cross-event correlation |

### Publisher

`publish(topic, event) → void` plus a `close()` lifecycle method. Async in all three languages.

### Subscriber

`subscribe(opts, handler) → subscription` plus `close()`. Async in all three.

`opts` shape:
- `topic` — string
- `group` — consumer group name, format `<service>.<purpose>` e.g. `governance.audit`
- `replay_from` — `"beginning" | "latest" | { timestamp }`. Default `"latest"`.
- `concurrency` — max in-flight per consumer. Default 10.
- `max_retries` — before DLQ. Default 5.

### Handler

`(event) → Promise<void>` / `async def(event)` / `func(ctx, event) error`. Receives one event; must be idempotent.

### Subscription

Has `unsubscribe()`. Returned by `subscribe()`.

### `create_bus(config)`

Factory. Returns a `{Publisher, Subscriber}` pair. The `config` chooses the provider:

```yaml
bus:
  provider: redis-streams       # or "kafka" later
  redis:
    url: redis://localhost:6379
  # kafka:
  #   brokers: [...]
  #   client_id: ...
```

---

## Language-specific surface (idiomatic in each)

### Node.js (`js/`)

```ts
import { createBus, Event } from '@owomide/bus';

const { publisher, subscriber } = createBus({ provider: 'redis-streams', redis: { url } });

await publisher.publish('proposal.submitted', {
  id: ulid(),
  type: 'proposal.submitted',
  occurred_at: new Date().toISOString(),
  partition_key: proposalId,
  payload: ProposalSubmitted.encode({ proposalId, actorId }).finish(),
});

await subscriber.subscribe(
  { topic: 'proposal.submitted', group: 'governance.audit' },
  async (event) => { /* idempotent business logic */ },
);
```

### Python (`py/`)

```py
from owomide_bus import create_bus, Event
from ulid import ULID

publisher, subscriber = create_bus(config={"provider": "redis-streams", "redis": {"url": url}})

await publisher.publish("proposal.submitted", Event(
    id=str(ULID()),
    type="proposal.submitted",
    occurred_at=datetime.now(UTC).isoformat(),
    partition_key=proposal_id,
    payload=ProposalSubmitted(proposal_id=proposal_id, actor_id=actor_id).SerializeToString(),
))

async def handler(event: Event):
    ...  # idempotent

await subscriber.subscribe(SubscribeOptions(topic="proposal.submitted", group="governance.audit"), handler)
```

### Go (`go/`)

```go
import "github.com/owomide/bus/pkg/bus"

pub, sub, err := bus.New(bus.Config{Provider: "redis-streams", Redis: bus.RedisConfig{URL: url}})
if err != nil { ... }

err = pub.Publish(ctx, "proposal.submitted", &bus.Event{
    ID:           ulid.Make().String(),
    Type:         "proposal.submitted",
    OccurredAt:   time.Now().UTC().Format(time.RFC3339),
    PartitionKey: proposalID,
    Payload:      payloadBytes,
})

err = sub.Subscribe(ctx, bus.SubscribeOptions{
    Topic: "proposal.submitted",
    Group: "governance.audit",
}, func(ctx context.Context, event *bus.Event) error {
    // idempotent business logic
    return nil
})
```

---

## The wire format (the cross-language binding)

This is what makes three native implementations interoperate by construction.

**Envelope:** JSON with these fields:

```json
{
  "envelope_version": 1,
  "id": "01HV...",
  "type": "proposal.submitted",
  "occurred_at": "2026-06-06T12:00:00Z",
  "partition_key": "prop_abc",
  "payload_b64": "Cg5wcm9wX2FiYxIIYWN0X3h5eg==",
  "metadata": {
    "trace_id": "...",
    "actor_id": "..."
  }
}
```

`payload_b64` is base64-encoded protobuf. The proto message type is identified by `type` plus a versioned schema in `src/lib/proto/events/<type>/v<n>.proto`.

**Rules:**
- All three implementations serialize identically. A Node publisher → Python subscriber works without translation. A Python publisher → Go subscriber works the same way.
- `envelope_version: 1` lets us evolve the envelope itself in the future without ambiguity.
- Adding a payload field is non-breaking (protobuf rules). Removing one is breaking — bump the proto major and namespace it under `events/<type>/v2.proto`.

---

## What the abstraction hides

Across all three languages, the bus library hides:

- **Provider client APIs** — Redis `XADD` / `XREADGROUP` / `XACK` vs Kafka producer/consumer/commit. Application code never sees either.
- **Consumer position bookkeeping** — Redis stream IDs vs Kafka offsets. Provider-managed; surfaced through `replay_from`.
- **Retries, backoff, DLQ** — Standard policy applied by the library, configurable per subscription.
- **Connection management** — Reconnects, pool sizing, heartbeats.
- **Tracing context propagation** — OpenTelemetry flows through `metadata.trace_id`.

## What the abstraction exposes

- **At-least-once delivery** — Both providers support it. Consumers MUST be idempotent.
- **Consumer groups** — N consumers in one group split partitions/streams; N consumers in different groups each see every event.
- **Ordering per `partition_key`** — Kafka guarantees this per partition. Redis Streams currently has one stream per topic, ordered globally — strictly stronger than per-partition. Application code can rely on "events with the same `partition_key` arrive in order" in both worlds.
- **Replay** — From beginning / timestamp / latest. Both translate cleanly.
- **DLQ access** — Read failed events from `{topic}.dlq`.

## What is explicitly NOT in the abstraction

Doesn't translate cleanly, so it's provider-specific config — not API:

- **Exactly-once semantics** — Kafka supports it (transactions); Redis Streams does not. The abstraction is at-least-once; that's the floor.
- **Cross-partition transactions** — Kafka-only. Don't design features that require this until Kafka is live.
- **Topic configuration (partition count, retention, MAXLEN)** — Lives in deployment manifests (`infra/k8s/`), not application code.
- **Provider-specific tooling** — `kafka-console-consumer`, `redis-cli XRANGE`, etc. Operators use these; application code doesn't.

---

## Critical rules

These apply identically to all three implementations.

1. **Idempotent handlers.** At-least-once delivery means duplicates happen. Every consumer dedupes by `event.id`, ideally at the DB level via a UNIQUE constraint or a `processed_events` table. Each language ships a `consumeIdempotent` / `consume_idempotent` / `ConsumeIdempotent` helper that wraps a Postgres-backed dedup table.

2. **Set `partition_key` whenever order matters.** Use the aggregate id (`proposal_id`, `batch_id`). The Redis provider currently ignores it, but the Kafka provider will need it — set it now.

3. **Payloads are protobuf, not freeform JSON.** Schemas live in `src/lib/proto/events/`. Adding fields is non-breaking; removing them is breaking (bump major, namespace under `v2/`).

4. **Never import a provider directly.** No `import { Redis } from 'ioredis'` or `import redis` outside `src/lib/bus/<lang>/providers/`. There's a lint rule in each language enforcing this; CI fails on violation.

5. **DLQ is monitored, not ignored.** `{topic}.dlq` is checked daily. Growing DLQ = P1.

6. **`group` names are namespaced by service.** Format: `<service>.<purpose>`, e.g. `governance.audit`, `notify.email`. Two services accidentally sharing a group name would split traffic — disaster.

7. **Interface parity is sacred.** Adding a method to one language's bus without the same method in the other two is a code-review fail. The contract is shared. If you need a feature, propose it for all three.

---

## Providers

### `redis-streams` (MVP, all three languages)

- Mechanics: `XADD` for publish, `XREADGROUP` + `XACK` for consume, `XCLAIM` for stuck-message retry, `XADD {topic}.dlq` for dead-lettering.
- Stream key per topic: `bus:proposal.submitted`.
- Consumer group key: `<topic>:<group>`, e.g. `bus:proposal.submitted:governance.audit`.
- `MAXLEN ~ 1000000` on every stream to bound memory.
- Clients: `ioredis` (js), `redis-py` (py), `go-redis` (go).

### `kafka` (added at scale, all three languages)

- Mechanics: producer/consumer per language's client; one Kafka topic per bus topic; partition count from manifest.
- Consumer groups map 1:1.
- Offsets stored in `__consumer_offsets` (Kafka-managed).
- DLQ topic: `{topic}.dlq`.
- Clients: `kafkajs` (js), `aiokafka` (py), `confluent-kafka-go` or `franz-go` (go).

The migration playbook (used the day Kafka is added):

1. Deploy Kafka alongside Redis. Both run.
2. Change one low-stakes service's bus config to `kafka` (e.g. Notify).
3. **Bridge worker** in `src/lib/bus/<any-lang>/bridge/` subscribes to every Redis topic and republishes to the equivalent Kafka topic. This means Kafka subscribers see Redis-published events and vice versa during cutover.
4. Move services one at a time. Validate after each.
5. When all services are on Kafka, decommission the bridge and the Redis Streams provider config.

The bridge is throwaway code — written for the migration, deleted after.

---

## Switching providers — what actually changes

| Layer | Changes? |
|---|---|
| Service code (publish / subscribe calls) | **No** |
| Event schemas (protos in `src/lib/proto/`) | **No** |
| Consumer idempotency logic | **No** |
| `partition_key` usage | **No** (set from day one) |
| Bus config in deployment manifest | **Yes** (`provider: redis-streams` → `provider: kafka`) |
| Operational runbooks (DLQ inspection, replay) | **Yes** (different CLI tools) |
| Capacity / partition planning | **Yes** (Kafka requires explicit partition count per topic) |
| Topic creation | **Yes** (Kafka topics managed via manifests; Redis streams auto-create on first publish) |

Application code stays still; operational practices change. We accept the operational change as the cost of the throughput gain.

---

## Definition of done

### F0.5 — JS + Python (Phase 0)

- [ ] `js/src/index.ts` exports `createBus`, `Publisher`, `Subscriber`, `Event`, `Handler`, `SubscribeOptions`
- [ ] `js/src/providers/redis-streams.ts` — full implementation
- [ ] `js/src/providers/kafka.ts` — stub that throws on `createBus({provider: 'kafka'})`
- [ ] `js/src/consume-idempotent.ts` — Postgres-backed dedup helper
- [ ] `py/owomide_bus/__init__.py` — full parity with JS public API
- [ ] `py/owomide_bus/providers/redis_streams.py` — full implementation
- [ ] `py/owomide_bus/providers/kafka.py` — stub
- [ ] `py/owomide_bus/consume_idempotent.py` — Postgres-backed dedup
- [ ] Lint rule enforcing no direct provider-client import outside `providers/` (ESLint for JS, custom ruff rule or grep-based for Py)
- [ ] Integration test: JS publish → JS subscribe with replay-from-beginning
- [ ] Integration test: Py publish → Py subscribe with replay-from-beginning
- [ ] **Cross-language interop test:** JS publishes, Py subscribes (same event id round-trips). Py publishes, JS subscribes.
- [ ] Handler throws → retry → eventually DLQ after `max_retries`
- [ ] Duplicate delivery → `consumeIdempotent` suppresses the duplicate
- [ ] `go/` directory exists with `README.md` documenting "implementation deferred until first Go service"
- [ ] `make lint` clean, `bazel test //src/lib/bus/...` green

### When the first Go service ships (post-MVP)

- [ ] `go/pkg/bus/bus.go` exports `New`, `Publisher`, `Subscriber`, `Event`, `Handler`, `SubscribeOptions` — same shape as JS/Py
- [ ] `go/pkg/bus/providers/redisstreams.go` — full implementation
- [ ] `go/pkg/bus/providers/kafka.go` — stub
- [ ] `go/pkg/bus/consume_idempotent.go`
- [ ] golangci-lint rule for provider isolation
- [ ] Integration tests in Go
- [ ] Three-way interop test: any-to-any across JS, Py, Go round-trips correctly

---

## Conventions specific to this package

- **The contract is sacred.** Changing the shape of `Publisher` or `Subscriber` is a breaking change across three languages. Any change requires an ADR.
- **Provider modules never leak provider types.** A `Subscription` returned from the Redis provider must be indistinguishable from one returned from the Kafka provider — same methods, same observable behaviour, in every language.
- **Wire format is versioned in the envelope** (`envelope_version: 1`). If we need a v2 envelope, all three implementations rev together and tolerate v1 during the rollout window.
- **No business logic.** This package routes events. It does not validate them (Zod / pydantic / Go validators live in services), does not transform them, does not log them beyond bus-level diagnostics.
- **Three implementations, one set of tests** for cross-language interop. Anything else is per-language unit/integration testing in its own subtree.
