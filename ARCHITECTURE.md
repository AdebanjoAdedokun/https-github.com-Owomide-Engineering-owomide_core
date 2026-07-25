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
| **Catalog** | Node.js | Org-scoped canonical products, SKUs, identifiers, controlled dimensions, and bitemporal costs/prices. |
| **Data Pipeline** | **Python** | Async file ingest, profiling, mapping, validation, canonical commit, later export and intelligence. |
| **Notify** | Node.js | Email + in-app notifications. Event subscriber. |
| **Gateway / BFF** | Node.js | Edge — auth, REST → gRPC translation, rate limiting. |

### Service-by-service summary

**Proposal.** Owns the lifecycle of a Pricing Proposal: `draft → submitted → blocked|approved → published`. Receives writes via REST through the gateway; emits the `proposal.*` events; orchestrates the override flow. Calls Margin synchronously during submit (batched validation). Never reads from raw or mapped import data. Approval authorizes a change; publish is the only transition that applies price changes to Catalog.

**Margin.** Stateless validation service. Exposes `validateBatch(skus[]) → violations[]`. Loads margin rules from its own schema. Reads cost & price data from Catalog. Returns structured violations (not just booleans) so the Proposal Service can return HTTP 422 with actionable detail.

**Repricing.** Owns change-sets — staged batches of price moves not yet visible to the world. A change-set is built via a scope query (channel, category, customer), previewed (diff vs. current canonical prices), then committed by wrapping in a Proposal. Repricing never publishes prices directly; that path always goes through Proposal.

**Governance.** Event-subscriber-only. Listens on the bus for the locked events plus catalog mutations; writes an append-only `audit_log` row per event; periodically snapshots canonical state for restore. Exposes only read APIs (timeline, snapshot diff, restore). The fact that no service can call Governance directly is the guarantee that audit cannot be sidestepped.

**Catalog.** The canonical pricing data store. Owns products, SKUs, namespaced identities, channels, locations, customer segments, and immutable bitemporal cost/price beliefs. Reads are broadly available through RPC. Data Pipeline and Proposal are the only canonical writers, through authenticated idempotent RPCs rather than direct SQL.

**Data Pipeline.** The bridge from messy outside-world data to canonical truth. See section 3.4 for the deep dive. It owns import staging, profiling, mapping, transformations, validation, canonical commit, and later export/intelligence modules.

**Notify.** Event-subscriber-only, mirror of Governance for user-facing comms. Listens on the bus, fans out emails (SES/Postmark TBD) and in-app banners. Never blocks an upstream flow.

**Gateway.** Single REST entry point. JWT auth at the edge. Routes to gRPC services. Returns canonical error envelopes. The only place CORS, rate limiting, and request logging live.

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
  ├── data_pipeline  (Data Pipeline Service)
  └── notify         (Notify Service)
```

### 3.2 Tenant boundary

Owomide may launch with one customer organization, but the schema must be multi-tenant-compatible from day one. The tenant boundary is `org_id`.

Every customer-owned table includes `org_id`, including import batches, mapping templates, products, SKUs, cost records, price records, proposals, proposal lines, margin rules, change-sets, audit rows, and notifications. Service-owned reference tables may omit it only when the data is truly global, such as ISO currency metadata.

All service requests carry the authenticated `org_id` from Gateway to downstream services as gRPC metadata. Handlers must reject any request that tries to read or write across organizations. Database indexes and uniqueness constraints for customer-owned records start with `org_id`.

For MVP, there is no org administration UI, cross-org reporting, or enterprise tenant management. There is still an `org_id` on the data model so isolation is not retrofitted later.

### 3.3 Versioned canonical data

`cost_record` and `price_record` in Catalog are versioned by both business time and system knowledge time:

- `effective_at` / `effective_until` answer: "When was this cost or price valid in the business?"
- `recorded_at` / `superseded_at` answer: "When did Owomide learn this value, and when was that belief superseded?"

Past margin calculations are reproducible, backdated imports are explainable, and Governance restores are deterministic. "Current price" is a query over versioned records, not a mutable field on a SKU.

### 3.4 Three-layer data boundary (Import path)

Customer pricing data arrives messy — different column names, currencies, units, formats. The boundary keeps the pricing core clean.

| Layer | Tables | Trust | Read by |
|---|---|---|---|
| **Raw** | `data_pipeline.import_row.raw_data` (JSONB); original file in MinIO | None | Data Pipeline only |
| **Staging** | `data_pipeline.import_row.mapped_data` (JSONB); `validation_event` | Partial | Data Pipeline only |
| **Canonical** | Catalog RPC over `product`, `sku`, `sku_identifier`, `cost_record`, `price_record`, and controlled dimensions | Full | Margin, Proposal, Governance, Data Pipeline |

The path from raw → staging → canonical:

1. **Upload** → original file goes to MinIO, an `ImportBatch` row is created, every row of the file is streamed into `ImportRow.raw_data` as JSONB.
2. **Profile** → `ColumnProfiler` detects headers, types, sample values, currency hints; returns suggested mappings.
3. **Map** → user accepts a `MappingTemplate` (saved per customer/channel, reusable forever) or builds a new one. The mapping plus `TransformationRules` (FX, tax, units, pack-size, discounts) writes `mapped_data` JSONB.
4. **Validate** → row-level checks against canonical schema constraints. Failures become `ValidationEvent` rows; the user sees a report.
5. **Commit** → `CanonicalCommit` calls Catalog `UpsertCanonical`; Catalog writes records/events transactionally, then Data Pipeline emits `import.committed`.

**The invariant:** canonical readers have no grants on `data_pipeline`, and Data Pipeline has no grants on `catalog`. Both boundaries are crossed through typed RPCs.

---

## 4 · Event architecture

The event bus is the second backbone, sitting alongside gRPC. gRPC is used when the caller needs a response (validate, lookup, preview); events are used when downstream interest is plural and the producer should not block on consumers (audit, notify, search index).

### 4.1 Locked events

| Event | When | Payload (core fields) |
|---|---|---|
| `proposal.submitted` | Proposal moves to `submitted` | org_id, proposal_id, change_set_id, actor_id, at |
| `proposal.blocked` | Margin returned violations on submit | org_id, proposal_id, violations[], actor_id, at |
| `proposal.approved` | Approver clicks approve | org_id, proposal_id, approver_id, actor_id, at |
| `proposal.published` | Approved proposal applies changes to Catalog | org_id, proposal_id, actor_id, effective_at, at |
| `override.requested` | User initiates override for blocked proposal | org_id, override_request_id, proposal_id, justification, actor_id, at |
| `override.approved` | Different actor approves override | org_id, proposal_id, override_request_id, approver_id, requester_id, at |
| `import.committed` | Canonical commit completes | org_id, batch_id, file_url, row_counts {ok, warned, excluded, errored}, template_id, actor_id, at |
| `catalog.sku_added` | Catalog creates a SKU | org_id, sku_id, provenance, at |
| `catalog.cost_updated` | Catalog records a new cost belief | org_id, sku_id, cost_record_id, provenance, at |
| `catalog.price_updated` | Catalog records a new price belief | org_id, sku_id, price_record_id, provenance, at |

### 4.2 Subscribers

- **Governance** — subscribes to all locked events. Writes audit rows. Snapshots after `proposal.published` and `import.committed`.
- **Notify** — subscribes to all locked events. Fans out emails and in-app notifications based on role + preferences.
- Future: search index, analytics warehouse, webhooks for customers.

### 4.3 Bus: provider-agnostic abstraction

Application code never speaks to a bus provider directly. Every service publishes and subscribes through `src/lib/bus`, which exposes a uniform `Publisher` / `Subscriber` API and selects the underlying provider from config.

**Provider: Kafka from day one.** Application code uses `src/lib/bus`; producers provide stable event IDs and partition keys, while consumers provide idempotent handling for at-least-once delivery.

The abstraction design — what's hidden, what's exposed, and what the migration actually requires — is in `src/lib/bus/CLAUDE.md`. The short version: events carry a `partition_key` and an idempotency `id`; the bus library handles consumer groups, retries, DLQ, replay, and tracing context propagation. Provider-specific concerns (Kafka partitions vs Redis stream IDs, Kafka transactions, Redis MAXLEN) stay inside the provider implementations.

---

## 5 · Critical paths (the four sequence flows)

The Excalidraw canvas carries each of these as a full sequence diagram. Summarised here in prose.

### 5.1 Flow 1 — Create proposal → margin check → approval → publish → export

1. User drafts in SPA → `POST /proposals` → Proposal stores draft.
2. User submits → Proposal calls `Margin.validateBatch(skus[])`.
3. If clean → state moves to `submitted`, emit `proposal.submitted`. Approver reviews → `POST /proposals/:id/approve` → state moves to `approved`, emit `proposal.approved`.
4. A permitted user publishes → `POST /proposals/:id/publish` → Proposal calls Catalog `ApplyPriceChanges`, state moves to `published`, emit `proposal.published`.
5. User triggers export → Data Pipeline builds a per-channel pack. Governance writes audit at each event. Notify pings the approver and the original author.

### 5.2 Flow 2 — Bulk repricing

1. User defines scope in SPA (filters) → `POST /change-sets/preview` → Repricing computes diff vs. current canonical prices, returns preview.
2. User adjusts, then submits → Repricing wraps the change-set in a Proposal, transfers to Proposal Service, deletes its own preview state.
3. Proposal runs the same submit → margin-validate → approve flow as Flow 1.
4. On publish, Catalog applies the price changes (versioned, with `effective_at`). Scheduled rollouts publish at the scheduled effective time via a delayed apply worker.

### 5.3 Flow 3 — Below-cost block + override

1. User submits a proposal → Margin returns violations.
2. Proposal moves to `blocked`, returns HTTP 422 with structured violations, emits `proposal.blocked`.
3. User initiates override → `POST /override-requests` with justification.
4. **Different actor** (enforced server-side — same actor returns 403) receives the request and approves → emit `override.approved`.
5. Proposal re-evaluates with the override token attached; state moves to `approved`. Catalog is unchanged until the proposal is published.
6. Governance has every step in the audit log; Notify pinged both parties.

### 5.4 Flow 4 — Import → map → validate → commit

See section 3.4 above. Full sequence on the Excalidraw canvas.

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
| ADR-008 | Bus is a provider-agnostic abstraction backed by Kafka from day one | Partition ordering and consumer groups are available without changing application contracts later |
| ADR-009 | gRPC server-to-server, REST only at gateway | Type-safe internal contracts; REST for external clients only |
| ADR-010 | Proposal is the sole canonical writer of proposals | Centralised state machine; no race conditions on lifecycle |
| ADR-011 | Kubernetes for orchestration (minikube local, k8s on Hetzner) | Industry-standard tooling, parity between local and prod via Kustomize overlays, ecosystem of controllers and operators we may want later (cert-manager, external-secrets, etc.) |
| ADR-012 | `org_id` is present on customer-owned data from day one | Avoids retrofitting tenant isolation after customer data exists; enables RLS and per-org analytics later |
| ADR-013 | Catalog cost and price records keep business time and system knowledge time | Supports backdated imports, reproducible margin math, and "what did we know then?" audits |

---

## 7 · Non-goals (MVP)

- **No org administration UI** — MVP may operate a single customer organization, but customer-owned tables still include `org_id`.
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
