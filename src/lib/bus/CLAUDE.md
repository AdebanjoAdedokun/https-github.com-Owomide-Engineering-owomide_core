# src/lib/bus

The provider-agnostic event bus library. **Three native implementations — Node.js, Python, Go — under one shared contract and one wire format.**

This package is the abstraction between application code and the event transport (Kafka). No service ever imports a Kafka client directly. Services import their language's bus binding, get a `Publisher` and `Subscriber`, and don't know — and don't care — what's underneath.

**Kafka is the production and development bus from day one.** The abstraction isolates services from Kafka client specifics, standardizes the wire format, and keeps the door open for testing with lighter transports if needed.

---

## Layout

```
src/lib/bus/
├── CLAUDE.md           ← this file (shared contract for all three impls)
├── BUILD.bazel
├── js/                 ← Node.js / TypeScript implementation
│   ├── src/
│   │   ├── index.ts              (public API — createBus, type exports)
│   │   ├── types.ts              (Event, Publisher, Subscriber, etc.)
│   │   ├── envelope.ts           (Event ↔ protobuf EventEnvelope)
│   │   ├── providers/
│   │   │   ├── kafka-publisher.ts
│   │   │   └── kafka-subscriber.ts
│   │   └── tests/
│   │       ├── envelope.test.ts
│   │       ├── publisher.test.ts
│   │       └── subscriber.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── py/                 ← Python implementation
│   ├── owomide_bus/
│   │   ├── __init__.py           (public API — create_bus, type exports)
│   │   ├── types.py              (Event, Publisher, Subscriber, etc.)
│   │   ├── envelope.py           (Event ↔ protobuf EventEnvelope)
│   │   ├── providers/
│   │   │   ├── __init__.py
│   │   │   ├── kafka_publisher.py
│   │   │   └── kafka_subscriber.py
│   │   └── tests/
│   │       ├── test_envelope.py
│   │       ├── test_publisher.py
│   │       └── test_subscriber.py
│   └── pyproject.toml
├── go/                 ← Go implementation
│   ├── pkg/bus/
│   │   ├── bus.go                (factory — New())
│   │   ├── types.go              (Event, Publisher, Subscriber, etc.)
│   │   ├── envelope.go           (Event ↔ protobuf EventEnvelope)
│   │   ├── kafka_publisher.go
│   │   ├── kafka_subscriber.go
│   │   └── envelope_test.go
│   └── go.mod
└── tests/              ← Cross-language interop tests
    ├── interop.sh              (orchestrator script)
    ├── interop_js.ts
    ├── interop_py.py
    ├── interop_go.go
    └── go.mod
```

---

## The shared contract

Every implementation exposes the same concepts. Names follow each language's idioms, but the *shape* is identical.

### Event

The envelope every event carries:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string (ULID / UUIDv7) | yes | Idempotency key — consumers dedupe by this |
| `type` | string | yes | Dotted name, e.g. `proposal.submitted` |
| `occurred_at` | ISO-8601 string (UTC) | yes | When the event happened |
| `partition_key` | string | recommended | Aggregate id (e.g. `proposal_id`). Kafka uses this for partition-level ordering. |
| `payload` | protobuf-encoded bytes | yes | Schema lives in `src/lib/proto/events/` |
| `metadata.trace_id` | string | optional | OpenTelemetry trace context |
| `metadata.span_id` | string | optional | OpenTelemetry span |
| `metadata.correlation_id` | string | optional | Cross-event correlation |

### Publisher

`publish(topic, event) → void` plus a `close()` lifecycle method. Async in all three languages. Kafka idempotent producer is enabled by default.

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
  provider: kafka
  kafka:
    brokers: ["localhost:9092"]
    client_id: proposal-svc
```

---

## Wire format

**Protobuf end-to-end.** The `EventEnvelope` proto (`src/lib/proto/events/envelope.proto`) is serialized as protobuf binary and sent as the Kafka message value. No JSON envelope, no base64.

- **Kafka key** = `partition_key` (ensures partition-level ordering)
- **Kafka value** = serialized `EventEnvelope` protobuf bytes
- All three implementations use the same proto schema, so a Node publisher → Python subscriber works without translation

**Rules:**
- All three implementations serialize identically. Cross-language interop tests verify this.
- Adding a payload field is non-breaking (protobuf rules). Removing one is breaking — bump the proto major and namespace it under `events/<type>/v2.proto`.

---

## Language-specific surface (idiomatic in each)

### Node.js (`js/`)

```ts
import { createBus, type Event } from '@owomide/bus';

const { publisher, subscriber } = createBus({
  provider: 'kafka',
  kafka: { brokers: ['localhost:9092'], clientId: 'proposal-svc' },
});

await publisher.publish('proposal.submitted', {
  id: crypto.randomUUID(),
  type: 'proposal.submitted',
  occurredAt: new Date().toISOString(),
  partitionKey: proposalId,
  payload: toBinary(ProposalSubmittedSchema, event),
});

await subscriber.subscribe(
  { topic: 'proposal.submitted', group: 'governance.audit' },
  async (event) => { /* idempotent business logic */ },
);
```

**Client:** kafkajs

### Python (`py/`)

```py
from owomide_bus import create_bus, Event, SubscribeOptions, BusConfig, KafkaConfig

bus = create_bus(BusConfig(provider="kafka", kafka=KafkaConfig(
    brokers=["localhost:9092"], client_id="data-pipeline-svc",
)))

await bus.publisher.publish("proposal.submitted", Event(
    id=str(uuid4()),
    type="proposal.submitted",
    occurred_at=datetime.now(UTC).isoformat(),
    partition_key=proposal_id,
    payload=ProposalSubmitted(proposal_id=proposal_id).SerializeToString(),
))

await bus.subscriber.subscribe(
    SubscribeOptions(topic="proposal.submitted", group="governance.audit"),
    handler,
)
```

**Client:** aiokafka

### Go (`go/`)

```go
import "github.com/owomide/bus/pkg/bus"

b, err := bus.New(bus.Config{
    Provider: "kafka",
    Kafka: bus.KafkaConfig{Brokers: []string{"localhost:9092"}, ClientID: "margin-svc"},
})

err = b.Publisher.Publish(ctx, "proposal.submitted", &bus.Event{
    ID:           uuid.NewString(),
    Type:         "proposal.submitted",
    OccurredAt:   time.Now().UTC().Format(time.RFC3339),
    PartitionKey: proposalID,
    Payload:      payloadBytes,
})

sub, err := b.Subscriber.Subscribe(ctx, bus.SubscribeOptions{
    Topic: "proposal.submitted",
    Group: "governance.audit",
}, func(ctx context.Context, event *bus.Event) error {
    return nil
})
```

**Client:** franz-go

---

## What the abstraction hides

- **Provider client APIs** — Kafka producer/consumer/commit internals. Application code never sees them.
- **Consumer position bookkeeping** — Kafka offsets. Provider-managed; surfaced through `replay_from`.
- **Retries, backoff, DLQ** — Exponential backoff applied by the library, configurable per subscription.
- **Connection management** — Reconnects, pool sizing, heartbeats.
- **Tracing context propagation** — OpenTelemetry flows through `metadata.trace_id`.

## What the abstraction exposes

- **At-least-once delivery** — Consumers MUST be idempotent. Consumer idempotency is a service responsibility, not a bus concern.
- **Consumer groups** — N consumers in one group split partitions; N consumers in different groups each see every event.
- **Ordering per `partition_key`** — Kafka guarantees ordering within a partition. Events with the same `partition_key` arrive in order.
- **Replay** — From beginning / timestamp / latest.
- **DLQ access** — Read failed events from `{topic}.dlq`.

## What is explicitly NOT in the abstraction

- **Exactly-once semantics** — Kafka supports it (transactions) but the abstraction targets at-least-once. Consumers must be idempotent.
- **Cross-partition transactions** — Kafka supports them but the abstraction does not expose them.
- **Topic configuration (partition count, retention)** — Lives in deployment manifests (`infra/k8s/`), not application code.
- **Consumer idempotency helpers** — The bus is transport. Services own their own dedup logic (DB constraints, processed_events tables, etc.).

---

## Critical rules

These apply identically to all three implementations.

1. **Idempotent handlers.** At-least-once delivery means duplicates happen. Every consumer dedupes by `event.id` at the service level — ideally at the DB level via a UNIQUE constraint or a `processed_events` table. The bus library does not provide dedup; that's a service concern.

2. **Set `partition_key` whenever order matters.** Use the aggregate id (`proposal_id`, `batch_id`). Kafka uses this for partition-level ordering.

3. **Payloads are protobuf, not freeform JSON.** Schemas live in `src/lib/proto/events/`. Adding fields is non-breaking; removing them is breaking (bump major, namespace under `v2/`).

4. **Never import Kafka clients directly.** No `import { Kafka } from 'kafkajs'` or `from aiokafka import` outside `src/lib/bus/<lang>/providers/`. Lint rule enforcement comes in F0.7.

5. **DLQ is monitored, not ignored.** `{topic}.dlq` is checked daily. Growing DLQ = P1.

6. **`group` names are namespaced by service.** Format: `<service>.<purpose>`, e.g. `governance.audit`, `notify.email`. Two services accidentally sharing a group name would split traffic — disaster.

7. **Interface parity is sacred.** Adding a method to one language's bus without the same method in the other two is a code-review fail. The contract is shared.

---

## Provider

### `kafka` (production + development)

- Mechanics: producer/consumer per language's client; one Kafka topic per bus topic; partition count from manifest.
- Idempotent producer enabled by default (Kafka-native producer dedup).
- Consumer groups map 1:1.
- Offsets stored in `__consumer_offsets` (Kafka-managed).
- DLQ topic: `{topic}.dlq`.
- Clients: `kafkajs` (js), `aiokafka` (py), `franz-go` (go).
- Local dev: single-node Kafka via Docker (Bitnami image) in minikube.

---

## Conventions specific to this package

- **The contract is sacred.** Changing the shape of `Publisher` or `Subscriber` is a breaking change across three languages. Any change requires an ADR.
- **Provider modules never leak provider types.** A `Subscription` returned from one provider must be indistinguishable from another — same methods, same observable behaviour.
- **No business logic.** This package routes events. It does not validate them (Zod / pydantic / Go validators live in services), does not transform them, does not log them beyond bus-level diagnostics.
- **Three implementations, one set of tests** for cross-language interop. Anything else is per-language unit/integration testing in its own subtree.
