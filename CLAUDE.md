# Owomide

Africa (Starting with Nigeria) B2B pricing & proposal SaaS for distributors and wholesalers.

The canonical object is the **Pricing Proposal**. Three product themes — **Margin**, **Bulk Repricing**, **Governance** — all bind to it.

---

## Repository layout

The principle: **everything that runs or is consumed by code lives under `src/`**. Outside `src/` is configuration and operational tooling.

A simple rule for placement: *does this thing have an entrypoint that listens or renders?* If yes, it's a service (`src/<name>/`). If it's consumed by other code (`import`-ed, linked, codegen'd into), it's a library (`src/lib/<name>/`).

```
owomide/
├── CLAUDE.md                  ← this file (project constitution)
├── ARCHITECTURE.md            ← system explanation, contracts, ADRs
├── BUILD_PLAN.md              ← phased roadmap + agentic workflow
├── MODULE.bazel               ← Bazel module config (Bzlmod)
├── BUILD.bazel
├── .bazelrc
├── .bazelversion
├── Makefile
├── .gitignore
├── .claude/
│   ├── agents/                ← subagent definitions (architect, schema, etc.)
│   └── commands/              ← repeatable slash commands
│
├── src/                       ← EVERYTHING RUNTIME — services + shared libraries
│   ├── proposal/              ← Proposal + bulk repricing service (Node.js)
│   ├── margin/                ← Margin service (Go)
│   ├── governance/            ← Governance service (Node.js)
│   ├── catalog/               ← Catalog service (Node.js)
│   ├── data-pipeline/         ← Data Pipeline service — ingestion + intelligence (Python)
│   ├── gateway/               ← Gateway / BFF (Node.js)
│   ├── notify/                ← Notify service (Node.js)
│   └── lib/                   ← SHARED PACKAGES — imported by services
│       ├── bus/               ← Provider-agnostic event bus
│       │   ├── CLAUDE.md      ←   single contract doc for all three impls
│       │   ├── BUILD.bazel
│       │   ├── js/            ←   Node.js / TypeScript implementation
│       │   ├── py/            ←   Python implementation
│       │   └── go/            ←   Go implementation (built when first Go service lands)
│       └── proto/             ← Shared protobuf definitions (events + service contracts)
│           ├── events/
│           └── services/
│
├── infra/                     ← DEPLOYMENT MANIFESTS (top-level — not runtime code)
│   ├── k8s/
│   │   ├── base/              ← Kustomize base
│   │   └── overlays/
│   │       ├── local/         ← minikube
│   │       ├── staging/
│   │       └── prod/          ← Hetzner k8s
│   └── skaffold.yaml
│
└── tools/                     ← BUILD-TIME TOOLING (lint, codegen, scripts — never imported at runtime)
    ├── bazel/                 ← Bazel rules, macros, custom toolchains
    ├── lint/                  ← shared lint configs (ESLint, ruff, golangci-lint)
    ├── codegen/               ← proto-codegen scripts, OpenAPI gen
    └── scripts/               ← dev / migration / one-off scripts
```

Each `src/<service>/` carries its own `CLAUDE.md` — loaded on-demand by Claude Code when working inside that folder. Migrations live in `src/<service>/migrations/`. Each service has its own `BUILD.bazel`.

The Excalidraw canvas (architecture + flows + import boundary) is the visual companion to `ARCHITECTURE.md`. Both must stay in sync; if you change a contract here, update both.

---

## Stack

- **Frontend:** React + Vite SPA (TypeScript)
- **Backend:** **Node.js (TypeScript) primary; Python for data-heavy services** (Data Pipeline). **Go for hot paths** (Margin). Pick the language that fits the problem; default to Node.
- **Build:** Bazel (`bazel build //...`, `bazel test //...`) — wraps Node, Python, and Go in the same graph.
- **DB:** PostgreSQL via **Supabase** — **schema-per-service**
- **Object store:** MinIO (S3-compatible) for raw import files
- **Cache:** Redis
- **Event bus:** **Kafka from day one** via `src/lib/bus` with **three native implementations** — Node.js (`js/`), Python (`py/`), Go (`go/`). Each service uses the one matching its language; all three share the same wire format and contract. See `src/lib/bus/CLAUDE.md`.
- **Orchestration:** **Kubernetes** — minikube locally, self-managed k8s (k3s or kubeadm) on Hetzner Cloud.

---

## Core invariants — these must not break

1. **Governance is an event subscriber only.** No service calls Governance directly. Audit cannot be bypassed.
2. **The pricing core reads only canonical tables.** Margin, Proposal, Governance, Export never touch `raw_*` or `mapped_*`. Enforced at Postgres role level — these services have no GRANTs on those tables.
3. **Below-cost is a server-side block.** Returns HTTP 422 with structured violation list. UI never makes this decision.
4. **Override is a state transition, not a flag retry.** Requires a different actor than the proposal owner (separation of duties from day one). Endpoint: `POST /override-requests`.
5. **Validation is batched.** `Margin.validateBatch(skus[])` only — never per-SKU loops in callers.
6. **Proposal Service is the sole canonical writer of proposals.** Other services emit events; Proposal mutates state.
7. **Approval is not publish.** Approval authorizes a proposal; only publish applies price changes to Catalog.
8. **Every customer-owned record is scoped by `org_id`.** The org comes from authenticated context and is propagated through gRPC metadata and events.
9. **Cost and price history preserve business time and system knowledge time.** Current price is derived from versioned records, not overwritten in place.
10. **A bulk preview is a draft change-set, not a proposal.** Only wrapped in a Proposal on submit.

---

## Events (locked schema)

| Event | Producer | Subscribers |
|---|---|---|
| `proposal.submitted` | Proposal | Governance, Notify |
| `proposal.blocked` | Proposal | Governance, Notify |
| `proposal.approved` | Proposal | Governance, Notify |
| `proposal.published` | Proposal | Governance, Notify |
| `override.requested` | Proposal | Governance, Notify |
| `override.approved` | Proposal | Governance, Notify |
| `import.committed` | Data Pipeline | Governance, Notify |

Payload schemas live in `src/lib/proto/events/`. Customer-owned events include `org_id`. Versioning: bump major on breaking field changes; consumers tolerate unknown fields.

---

## Commands

```bash
# Build & test
bazel build //...
bazel test //...

# Run a single service locally (out of cluster, for fast iterate)
bazel run //src/proposal:server

# Local k8s dev stack (minikube + Skaffold; hot reload on change)
make dev                                  # equivalent to: skaffold dev
make dev-infra                            # only Postgres / Redis / MinIO — useful when running a service bare-metal for debugging
make dev-down                             # tear minikube down

# DB migrations
make migrate                              # apply pending across all services
make migrate-create svc=<name> name=<desc>

# Lint & format
make lint
make fmt

# Generate clients from proto (run after editing src/lib/proto)
make proto

# k8s manifest validation (also runs in CI)
make manifests-validate
```

---

## Conventions

- **Node services:** TypeScript strict mode. No `any`. Validate inputs at boundaries with Zod.
- **Python services:** Type hints required; `ruff` for lint, `pyright` for typecheck. Validate inputs at gRPC handlers.
- **Go services:** standard `go fmt` / `golangci-lint`; protobuf-first for contracts.
- **Schema-per-service.** Migrations live in `src/<name>/migrations/`. Each service connects with its own Postgres role.
- **Tenant boundary.** Customer-owned tables include `org_id`; indexes and uniqueness constraints start with it where applicable.
- **gRPC for service-to-service.** REST only at the gateway (BFF pattern).
- **Events:** dotted `noun.verb` names. Payloads are protobuf-encoded (defined in `src/lib/proto/events/`). Versioned; consumers tolerate unknown fields.
- **Bus access is always through `src/lib/bus`** — never import a provider (Redis client, Kafka client) directly from service code.
- **Branches:** `agent/<service>-<feature-id>` e.g. `agent/margin-F3.2`.
- **PRs:** title references the `BUILD_PLAN.md` feature ID; description lists Definition-of-Done checkboxes.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, etc.).
- **Tests:** integration tests run against real Postgres + real Kafka (via testcontainers, parity with the cluster).
- **k8s manifests:** Kustomize, layered `base/` + overlays (`local`, `staging`, `prod`). Manifests live in `infra/k8s/`.

---

## When to use which service

- Need to read pricing data → **Catalog**
- Need to validate prices against margin floors → **Margin** (batched)
- Building a change-set of multiple price moves → **Proposal** (bulk repricing — preview-first)
- Anything that should be auditable → **emit an event**, do not call Governance
- File upload → **Data Pipeline** → canonical commit → done
- Sending email or in-app notification → emit an event, **Notify** subscribes
- FX, currency conversion, ML-flavored math → **Data Pipeline** (intelligence sub-package, Python via gRPC)

---

## Glossary

- **Pricing Proposal** — the canonical artifact. Lifecycle: `draft → submitted → blocked|approved → published`. Approval authorizes the change; publish applies it to Catalog. Owned by the Proposal Service.
- **Change-Set** — staged batch of price changes. Owned by Proposal (bulk repricing module). Wrapped in a Proposal on submit.
- **Override Request** — separate object granting a one-time exception to a margin floor. Requires different actor approval.
- **ImportBatch / ImportRow** — staging structures inside Data Pipeline. Not readable from outside.
- **Canonical layer** — `products`, `skus`, `cost_records`, `price_records`, `channels`, `locations`. Validated. Typed. Indexed. The system of record.
- **System knowledge time** — when Owomide recorded or superseded a cost/price value. Used with business-effective time for historical "as of" answers.
- **Mapping Template** — reusable column-mapping per customer/channel. One-click re-import once saved.

---

## Working with this codebase as Claude Code

- Always use **Plan Mode** (Shift+Tab) before non-trivial changes.
- For features spanning multiple services, draft the contract change in `src/lib/proto/` first, then build producers and consumers in parallel worktrees.
- When you learn something new about this project that isn't in CLAUDE.md, propose adding it. Conventions evolve; this file is the constitution.
- Subagent recipes live in `.claude/agents/`. See `BUILD_PLAN.md` for the architect / schema / implementer / tester / reviewer pattern.
- Use `.claude/agents/data-architect.md` for Catalog, tenant boundary, price history, and analytics-readiness decisions.
- Use `.claude/agents/schema-reviewer.md` before merging migrations or schema-changing PRs.
- Use `.claude/agents/import-pipeline.md` for CSV/XLSX ingestion, mapping templates, validation, and canonical commit behavior.
