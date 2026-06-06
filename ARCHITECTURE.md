# Owomide Architecture

This document is the textual companion to the Excalidraw canvas. The canvas is the picture; this is the spec. If they disagree, this file is authoritative — and the canvas should be updated to match.

---

## 1 · System overview

Owomide is a B2B pricing operations platform. The product surface is three themes — **Margin**, **Bulk Repricing**, **Governance** — all of which orbit a single canonical object: the **Pricing Proposal**.

The system is a Bazel monorepo of **Node.js (TypeScript) and Python** services — with **Go welcome later** for services that earn it — fronted by a React SPA, deployed on **Kubernetes** (minikube locally, self-managed k8s on Hetzner).

```
Client ─────► Edge / Gateway ─────► Node Services ◄──► Python Intelligence
                                          │
                                          ▼
                                       Data: Postgres · Redis · MinIO
```

The architecture is **vertically sliced by service** (each service owns its domain, schema, and contract) and **horizontally bound by events** (services emit; downstream consumers listen).

---

## 2 · Service catalog

The "Language" column is the **starting** language. The bus and gRPC contracts are language-neutral by design; if a service later needs to be rewritten in Go for throughput, no caller changes.

| Service | Language | Role |
|---|---|---|
| **Proposal** | Node.js | Canonical Pricing Proposal — state machine, approvals, comments. The hub. |
| **Margin** | **Go** | Margin rules, validation, breach detection. Theme 1. |
| **Repricing** | Node.js | Bulk change-sets, scope builder, preview, scheduled rollouts. Theme 2. |
| **Governance** | Node.js | Append-only audit log, version snapshots, restore. Theme 3. Event subscriber only. |
| **Catalog** | Node.js | Shared canonical pricing data — products, SKUs, costs, prices, channels, locations. |
| **Import/Export** | **Python** | File ingest, column profiling, mapping templates, transformation rules, canonical commit, export packs. |
| **Notify** | Node.js | Email + in-app notifications. Event subscriber. |
| **Gateway / BFF** | Node.js | Edge — auth, REST → gRPC translation, rate limiting. |
| **Intelligence** | **Python** | FX/volatility calculator, margin rule engine. gRPC. Deferred ML/optimization. |

### Service-by-service summary

**Proposal.** Owns the lifecycle of a Pricing Proposal: `draft → submitted → blocked|approved → published`. Receives writes via REST through the gateway; emits the `proposal.*` events; orchestrates the override flow. Calls Margin synchronously during submit (batched validation). Never reads from raw or mapped import data.

**Margin.** Stateless validation service. Exposes `validateBatch(skus[]) → violations[]`. Loads margin rules from its own schema. Reads cost & price data from Catalog. Returns structured violations (not just booleans) so the Proposal Service can return HTTP 422 with actionable detail.

**Repricing.** Owns change-sets — staged batches of price moves not yet visible to the world. A change-set is built via a scope query (channel, category, customer), previewed (diff vs. current canonical prices), then committed by wrapping in a Proposal. Repricing never publishes prices directly; that path always goes through Proposal.

**Governance.** Event-subscriber-only. Listens on the bus for the six locked events plus catalog mutations; writes an append-only `audit_log` row per event; periodically snapshots canonical state for restore. Exposes only read APIs (timeline, snapshot diff, restore). The fact that no service can call Governance directly is the guarantee that audit cannot be sidestepped.

**Catalog.** The canonical pricing data store. Tables: `products`, `skus`, `cost_records`, `price_records`, `channels`, `locations`. Holds versioned cost snapshots so historical margin math is reproducible. Read-heavy from Margin and Proposal; written by Import/Export's canonical-commit phase and by published Proposals.

**Import/Export.** The bridge from messy outside-world data to canonical truth. See section 5 (Three-layer data boundary) for the deep dive. Holds eight internal components: `ImportBatch`, `ImportRow`, `ColumnProfiler`, `MappingTemplate`, `TransformationRules`, `ValidationEvent`, `CanonicalCommit`, and `ExportPacks`.

**Notify.** Event-subscriber-only, mirror of Governance for user-facing comms. Listens on the bus, fans out emails (SES/Postmark TBD) and in-app banners. Never blocks an upstream flow.

**Gateway.** Single REST entry point. JWT auth at the edge. Routes to gRPC services. Returns canonical error envelopes. The only place CORS, rate limiting, and request logging live.

**Intelligence (Python).** A second service in the same monorepo, exposed via gRPC. Phase-0 scope: FX rate calculator + margin rule engine. Bazel wraps both Node and Python; the runtime boundary is purely gRPC. Shared protobuf in `src/lib/proto/`.

---

## 3 · Data architecture

### 3.1 Schema-per-service

Every service has its own Postgres schema and connects with its own database role. A service's role has DDL + DML permissions on its own schema and **no permissions** on any other service's schema. Cross-service data flows via gRPC or events, never via shared SQL.

This is the strongest available enforcement of the service boundary on a single Postgres instance, and it costs nothing in operational overhead vs. one DB per service.

```
postgres://owomide
  ├── proposal       (Proposal Service)
  ├── margin         (Margin Service)
  ├── repricing      (Repricing Service)
  ├── governance     (Governance Service)
  ├── catalog        (Catalog Service)
  ├── import_export  (Import/Export Service)
  └── notify         (Notify Service)
```

### 3.2 Versioned canonical data

`cost_records` and `price_records` in Catalog are append-only with `effective_at` / `effective_until` columns. Past margin calculations are reproducible. Restores from Governance snapshots are deterministic.

### 3.3 Three-layer data boundary (Import path)

Customer pricing data arrives messy — different column names, currencies, units, formats. The boundary keeps the pricing core clean.

| Layer | Tables | Trust | Read by |
|---|---|---|---|
| **Raw** | `import_export.import_row.raw_data` (JSONB); original file in MinIO | None | Import/Export only |
| **Staging** | `import_export.import_row.mapped_data` (JSONB); `validation_event` | Partial | Import/Export only |
| **Canonical** | `catalog.products`, `skus`, `cost_records`, `price_records`, `channels`, `locations` | Full | Margin, Proposal, Governance, Export |

The path from raw → staging → canonical:

1. **Upload** → original file goes to MinIO, an `ImportBatch` row is created, every row of the file is streamed into `ImportRow.raw_data` as JSONB.
2. **Profile** → `ColumnProfiler` detects headers, types, sample values, currency hints; returns suggested mappings.
3. **Map** → user accepts a `MappingTemplate` (saved per customer/channel, reusable forever) or builds a new one. The mapping plus `TransformationRules` (FX, tax, units, pack-size, discounts) writes `mapped_data` JSONB.
4. **Validate** → row-level checks against canonical schema constraints. Failures become `ValidationEvent` rows; the user sees a report.
5. **Commit** → `CanonicalCommit` upserts cleaned rows into Catalog tables, then emits `import.committed`.

**The invariant:** the four canonical-reading services (Margin, Proposal, Governance, Export) have no GRANTs on the `import_export` schema. They cannot bypass the contract by accident or design.

---

## 4 · Event architecture

The event bus is the second backbone, sitting alongside gRPC. gRPC is used when the caller needs a response (validate, lookup, preview); events are used when downstream interest is plural and the producer should not block on consumers (audit, notify, search index).

### 4.1 Locked events

| Event | When | Payload (core fields) |
|---|---|---|
| `proposal.submitted` | Proposal moves to `submitted` | proposal_id, change_set_id, actor_id, at |
| `proposal.blocked` | Margin returned violations on submit | proposal_id, violations[], actor_id, at |
| `proposal.approved` | Approver clicks approve | proposal_id, approver_id, actor_id, at |
| `override.requested` | User initiates override for blocked proposal | override_request_id, proposal_id, justification, actor_id, at |
| `override.approved` | Different actor approves override | override_request_id, approver_id, at |
| `import.committed` | Canonical commit completes | batch_id, file_url, row_counts {ok, warned, excluded}, template_id, actor_id, at |

### 4.2 Subscribers

- **Governance** — subscribes to all six. Writes audit rows. Snapshots after `proposal.approved` and `import.committed`.
- **Notify** — subscribes to all six. Fans out emails and in-app notifications based on role + preferences.
- Future: search index, analytics warehouse, webhooks for customers.

### 4.3 Bus: provider-agnostic abstraction

Application code never speaks to a bus provider directly. Every service publishes and subscribes through `src/lib/bus`, which exposes a uniform `Publisher` / `Subscriber` API and selects the underlying provider from config.

**Phase 0 provider: Redis Streams.** Redis is already in the stack; Streams gives us consumer groups and at-least-once delivery; we avoid running a second piece of infrastructure during MVP.

**Migration path: Kafka.** When sustained throughput exceeds Redis Streams' comfortable ceiling (~50k events/min) or when we need true partition-level ordering across many consumers, we add a Kafka provider to `src/lib/bus/src/providers/kafka.ts`. **Application code does not change** — only the provider config flips.

The abstraction design — what's hidden, what's exposed, and what the migration actually requires — is in `src/lib/bus/CLAUDE.md`. The short version: events carry a `partition_key` and an idempotency `id`; the bus library handles consumer groups, retries, DLQ, replay, and tracing context propagation. Provider-specific concerns (Kafka partitions vs Redis stream IDs, Kafka transactions, Redis MAXLEN) stay inside the provider implementations.

---

## 5 · Critical paths (the four sequence flows)

The Excalidraw canvas carries each of these as a full sequence diagram. Summarised here in prose.

### 5.1 Flow 1 — Create proposal → margin check → approval → export

1. User drafts in SPA → `POST /proposals` → Proposal stores draft.
2. User submits → Proposal calls `Margin.validateBatch(skus[])`.
3. If clean → state moves to `submitted`, emit `proposal.submitted`. Approver reviews → `POST /proposals/:id/approve` → state moves to `approved`, emit `proposal.approved`. User triggers export → Import/Export builds per-channel pack.
4. Governance writes audit at each event. Notify pings the approver and the original author.

### 5.2 Flow 2 — Bulk repricing

1. User defines scope in SPA (filters) → `POST /change-sets/preview` → Repricing computes diff vs. current canonical prices, returns preview.
2. User adjusts, then submits → Repricing wraps the change-set in a Proposal, transfers to Proposal Service, deletes its own preview state.
3. Proposal runs the same submit → margin-validate → approve flow as Flow 1.
4. On approval, Catalog applies the price changes (versioned, with `effective_at`). Scheduled rollouts handled via a delayed apply worker.

### 5.3 Flow 3 — Below-cost block + override

1. User submits a proposal → Margin returns violations.
2. Proposal moves to `blocked`, returns HTTP 422 with structured violations, emits `proposal.blocked`.
3. User initiates override → `POST /override-requests` with justification.
4. **Different actor** (enforced server-side — same actor returns 403) receives the request and approves → emit `override.approved`.
5. Proposal re-evaluates with the override token attached; state moves to `approved`.
6. Governance has every step in the audit log; Notify pinged both parties.

### 5.4 Flow 4 — Import → map → validate → commit

See section 3.3 above. Full sequence on the Excalidraw canvas.

---

## 6 · Architectural decisions

These are decisions made early and locked. Changing them requires explicit ADR (Architecture Decision Record) in `docs/adr/`.

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Bazel monorepo wraps Node + Python (Go welcome later) | Single build graph, easy cross-language refactor, hermetic builds, language choice per service without infra fragmentation |
| ADR-002 | Schema-per-service in one Postgres | Strong isolation without operational cost of N databases |
| ADR-003 | Governance is subscribe-only | Audit cannot be bypassed; impossible to forget to call it |
| ADR-004 | Below-cost returns HTTP 422 | Semantically correct (not 400 — request was well-formed) |
| ADR-005 | Override is its own resource, not a flag | Separation of duties enforceable; auditable separately |
| ADR-006 | Validation is batched only | Prevents N+1 hidden in callers; performance budget owned in one place |
| ADR-007 | Three-layer data boundary | Pricing core never sees messy data; raw stays forensic; mappings reusable |
| ADR-008 | Bus is a provider-agnostic abstraction; Redis Streams at MVP, Kafka later | Application code is portable; we don't run Kafka before we need to; growth doesn't require rewriting service code |
| ADR-009 | gRPC server-to-server, REST only at gateway | Type-safe internal contracts; REST for external clients only |
| ADR-010 | Proposal is the sole canonical writer of proposals | Centralised state machine; no race conditions on lifecycle |
| ADR-011 | Kubernetes for orchestration (minikube local, k8s on Hetzner) | Industry-standard tooling, parity between local and prod via Kustomize overlays, ecosystem of controllers and operators we may want later (cert-manager, external-secrets, etc.) |

---

## 7 · Non-goals (MVP)

- **No multi-tenant isolation** — single-tenant initially. Schema-per-tenant possible later but out of scope.
- **No mobile app** — responsive web only.
- **No real-time collaborative editing** — single-editor at a time, optimistic locking.
- **No ML / pricing optimization** — Intelligence service ships Phase-6 with FX + rule engine only.
- **No external API for customers** — internal-facing tools only at launch.
- **No SSO / SAML** — JWT + email/password for MVP, add later.

---

## 8 · Cross-cutting concerns

- **Auth:** JWT at edge, propagated as gRPC metadata. Role check at handler level (`@requires_role("approver")`).
- **Observability:** OpenTelemetry traces across gRPC, structured JSON logs, Prometheus metrics scraped by the host.
- **Secrets:** Hetzner Vault or 1Password Connect — TBD Phase 0.
- **CI:** GitHub Actions running `bazel test //...`, linting (TS / Python / Go), container image builds, and k8s manifest validation (`kubeval`, `kustomize build`). Deploys to staging on merge to `main` via `kubectl apply -k` against the Hetzner cluster; promotion to prod is manual.
- **Backups:** nightly Postgres dump to MinIO; MinIO replicated to a second Hetzner box.

---

## 9 · How to extend this

When adding a new capability:

1. Decide which existing service owns it. If none do, justify the new service in an ADR.
2. Draft the contract change in `src/lib/proto/` first.
3. Update the relevant `src/<svc>/CLAUDE.md` with the new method, table, or event.
4. Update this file's service catalog if the boundary moved.
5. Update the Excalidraw canvas (the picture must agree with the spec).
6. Build the implementation, with tests against the contract.
