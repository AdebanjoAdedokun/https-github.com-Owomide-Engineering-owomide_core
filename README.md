# Owomide

B2B pricing and proposal SaaS for African distributors and wholesalers, starting with Nigeria.

The canonical object is the **Pricing Proposal**. Three product themes orbit it:

- **Margin** — margin floor rules, below-cost blocking, override requests
- **Bulk Repricing** — scoped change-sets, preview-before-commit, scheduled rollouts
- **Governance** — append-only audit log, version snapshots, point-in-time restore

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (TypeScript) |
| Backend | Node.js (TypeScript) primary; Python for data-heavy services; Go for hot paths (Margin) |
| Build | Bazel 7 (bzlmod) |
| Database | PostgreSQL via Supabase — schema-per-service |
| Cache | Redis |
| Object store | MinIO (S3-compatible) |
| Event bus | Kafka from day one (`src/lib/bus` abstraction) |
| Orchestration | Kubernetes — OrbStack locally, k3s/kubeadm on Hetzner Cloud |
| IPC | gRPC service-to-service; REST only at the gateway |

## Repository layout

```
owomide_core/
├── src/                        # All runtime code
│   ├── catalog/                # Canonical pricing data (Node.js)
│   ├── proposal/               # Pricing Proposal + bulk repricing (Node.js)
│   ├── margin/                 # Margin rules + validation (Go)
│   ├── governance/             # Audit log, snapshots (Node.js)
│   ├── catalog/                # Canonical pricing data (Node.js)
│   ├── data-pipeline/          # File ingest + intelligence (Python)
│   ├── gateway/                # BFF — auth, REST→gRPC (Node.js)
│   ├── notify/                 # Email + in-app notifications (Node.js)
│   └── lib/
│       ├── bus/                # Event bus abstraction (js/, py/, go/)
│       └── proto/              # Shared protobuf (events + service contracts)
├── infra/                      # k8s manifests + Skaffold config
│   ├── k8s/base/               # Kustomize base
│   └── k8s/overlays/           # local / staging / prod
├── tools/                      # Build tooling, lint configs, codegen scripts
├── MODULE.bazel                # Bazel module config
├── Makefile                    # Developer commands
├── ARCHITECTURE.md             # System spec + ADRs
├── BUILD_PLAN.md               # Phased roadmap + agentic workflow
├── docs/                       # Research and implementation notes
└── CLAUDE.md                   # Project constitution for Claude Code
```

## Prerequisites

Install via [Homebrew](https://brew.sh/):

```bash
brew install bazelisk node@20 python@3.12 pnpm kubectl skaffold kustomize kubeval
```

We use [OrbStack](https://orbstack.dev/) as our container runtime and local Kubernetes cluster (recommended for macOS — ships built-in k8s, no minikube needed):

```bash
brew install orbstack
```

| Tool | Version | Purpose |
|------|---------|---------|
| Bazelisk | latest | Bazel version manager (reads `.bazelversion`) |
| Node.js | 20+ | Backend services + gateway |
| Python | 3.12+ | Data Pipeline service |
| pnpm | 9+ | Node package manager |
| OrbStack | latest | Container runtime + built-in Kubernetes |
| kubectl | latest | Kubernetes CLI |
| Skaffold | latest | Dev loop — build, deploy, hot-reload |
| kustomize | latest | k8s manifest composition (local/staging/prod overlays) |
| kubeval | latest | k8s manifest schema validation |

## Local Kubernetes setup (OrbStack)

OrbStack ships with a built-in Kubernetes cluster — no extra cluster setup needed.

### 1. Enable Kubernetes in OrbStack

Open **OrbStack → Settings → Kubernetes → Enable**. Wait for the cluster to become ready (usually under 30 seconds).

### 2. Verify

```bash
kubectl config use-context orbstack
kubectl get nodes
```

You should see a single node in `Ready` state.

### 3. Start the dev stack

```bash
make dev
```

This builds the gateway image locally, deploys all backing services (Postgres, Redis, MinIO, Kafka) and the gateway to OrbStack k8s, and starts port-forwarding:

| Service | Local port |
|---------|-----------|
| Gateway (REST API) | `localhost:5000` |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |
| MinIO API | `localhost:9000` |
| MinIO Console | `localhost:9001` |
| Kafka | `localhost:9092` |
| Bus smoke subscriber | `localhost:5100` |

> Port 3000 is **not** forwarded — it is reserved for the frontend SPA.

Verify the F0.9 bus smoke path after `make dev` is running:

```bash
make bus-smoke-test
```

This checks that the local smoke publisher emitted `test.ping` through Kafka and
the local smoke subscriber received it through `src/lib/bus`.

### 4. Apply database migrations

```bash
make migrate
```

Runs against the in-cluster Postgres via the port-forward on `localhost:5432`.

### 5. Tear down

```bash
make dev-down   # removes deployed resources; OrbStack cluster stays up
```

### 4. Access services

`make dev` port-forwards cluster services to localhost (see the port table above),
so you reach them directly — e.g. `curl localhost:5000/health` for the gateway,
`psql …@localhost:5432` for Postgres, MinIO console at `localhost:9001`.

```bash
# Inspect cluster state
kubectl get pods
kubectl logs deploy/gateway -f

# OrbStack ships a built-in dashboard — open the OrbStack app → Kubernetes
```

### 5. Tear down

```bash
make dev-down     # removes deployed resources; the OrbStack cluster stays up
```

> **Coming in F0.2:** `make dev` will automate cluster setup + Skaffold deployment of all services with hot-reload. For now, these manual steps get you a running cluster.

## Database setup (local dev)

The migration runner creates schemas and Postgres roles, then applies SQL migrations per service. You need a running local Postgres instance before running migrations.

### 1. Create your local `.env`

```bash
cp .env.example .env
```

Edit `.env` to match your local Postgres connection. The defaults in `.env.example` assume Postgres running on `localhost:5432` with a database named `owomide`. Adjust if yours differs.

The `*_SVC_PASSWORD` values can be any non-empty string locally — the runner uses them to create isolated roles per service.

### 2. Run migrations

```bash
make migrate                               # create all schemas, roles, and apply all migrations
make migrate svc=catalog                   # apply for one service only
```

On first run this will:
- Create a `public.schema_migrations` tracking table
- Create one Postgres schema per service (`catalog`, `proposal`, `margin`, etc.)
- Create one Postgres role per service (`catalog_svc`, `proposal_svc`, etc.)
- Apply any pending `.sql` files from `src/<service>/migrations/`

Subsequent runs are idempotent — already-applied migrations are skipped.

### 3. Create a new migration file

```bash
make migrate-create svc=catalog name=add_products_table
# → creates src/catalog/migrations/0002_add_products_table.up.sql
# → creates src/catalog/migrations/0002_add_products_table.down.sql
```

Fill in the generated files and run `make migrate` again to apply.

### 4. Roll back

```bash
make migrate-down svc=catalog              # roll back the last applied migration
make migrate-down svc=catalog steps=3      # roll back the last 3
```

### CI/CD (staging / prod)

Migrations run automatically in GitHub Actions on every push to `main` (wired in F0.7). The pipeline reads the same env vars from GitHub Actions secrets — one set per environment (staging, production). Use the Supabase **direct connection string** (not the pooler URL) for `DATABASE_URL` in those secrets.

## Make commands

| Command | Status | Description |
|---------|--------|-------------|
| `make help` | Ready | Show all available targets |
| `make build` | Ready | `bazel build //...` |
| `make test` | Ready | `bazel test //...` |
| `make lint` | F0.7 | Run ESLint, ruff, golangci-lint |
| `make fmt` | F0.7 | Auto-format (prettier, ruff, gofmt) |
| `make dev` | F0.2 | Start OrbStack + Skaffold dev stack |
| `make dev-infra` | F0.2 | Start infra only (Postgres, Redis, MinIO, Kafka) |
| `make dev-down` | F0.2 | Tear down deployed dev resources (OrbStack cluster stays up) |
| `make migrate [svc=X]` | F0.6 | Apply pending DB migrations (all services or one) |
| `make migrate-down svc=X [steps=N]` | F0.6 | Roll back last N migrations for a service |
| `make migrate-create svc=X name=Y` | F0.6 | Scaffold a new paired .up.sql + .down.sql |
| `make proto` | F0.3 | Regenerate protobuf clients |
| `make manifests-validate` | F0.7 | Validate k8s manifests |

Stubbed targets print a message and exit cleanly. They'll be wired up as Phase 0 progresses.

## Service catalog

| Service | Language | Role |
|---------|----------|------|
| Proposal | Node.js | Pricing Proposal lifecycle + bulk repricing — state machine, approvals, scope builder, preview, scheduled rollouts |
| Margin | Go | Margin rules, batch validation, breach detection |
| Governance | Node.js | Org-scoped append-only audit log, version snapshots, restore (event subscriber only) |
| Catalog | Node.js | Org-scoped canonical pricing data — products, SKUs, costs, prices, channels |
| Data Pipeline | Python | File ingest, column profiling, mapping, transformation, canonical commit, FX, intelligence |
| Gateway | Node.js | Edge — JWT auth, REST-to-gRPC, rate limiting |
| Notify | Node.js | Email (Zoho ZeptoMail) + in-app notifications (event subscriber) |

## Development workflow

- **Branches:** `agent/<service>-<feature-id>` (e.g. `agent/margin-F3.2`)
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`)
- **PRs:** title references the BUILD_PLAN.md feature ID; description includes Definition-of-Done checklist
- **Tenant boundary:** customer-owned data is scoped by `org_id` from day one
- **gRPC for internal calls**, REST only at the gateway
- **Events through `src/lib/bus`** — never import Redis/Kafka clients directly

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — system spec, data architecture, ADRs, sequence flows
- [BUILD_PLAN.md](BUILD_PLAN.md) — phased roadmap (F0-F7), agentic workflow, Definition of Done
- [CLAUDE.md](CLAUDE.md) — project constitution, conventions, invariants
- [docs/data-model.md](docs/data-model.md) — canonical data model assumptions
- [docs/import-pipeline.md](docs/import-pipeline.md) — raw/staging/canonical import path
- [docs/price-history.md](docs/price-history.md) — business-time and recorded-time pricing semantics
- [docs/data-quality-rules.md](docs/data-quality-rules.md) — import validation severities and rules
- [docs/analytics-strategy.md](docs/analytics-strategy.md) — MVP analytics and future Iceberg/Trino path
- [docs/research/pricing-platform-research.md](docs/research/pricing-platform-research.md) — source-backed product/data research
- Per-service docs in `src/<service>/CLAUDE.md`
