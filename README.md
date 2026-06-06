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
| Backend | Node.js (TypeScript) primary; Python for math-heavy services; Go welcome later |
| Build | Bazel 7 (bzlmod) |
| Database | PostgreSQL — single instance, schema-per-service |
| Cache | Redis |
| Object store | MinIO (S3-compatible) |
| Event bus | Provider-agnostic abstraction (`src/lib/bus`); Redis Streams at MVP, Kafka at scale |
| Orchestration | Kubernetes — minikube locally, k3s/kubeadm on Hetzner Cloud |
| IPC | gRPC service-to-service; REST only at the gateway |

## Repository layout

```
owomide_core/
├── src/                        # All runtime code
│   ├── catalog/                # Canonical pricing data (Node.js)
│   ├── proposal/               # Pricing Proposal state machine (Node.js)
│   ├── margin/                 # Margin rules + validation (Go)
│   ├── repricing/              # Bulk change-sets (Node.js)
│   ├── governance/             # Audit log, snapshots (Node.js)
│   ├── import-export/          # File ingest + canonical commit (Python)
│   ├── gateway/                # BFF — auth, REST→gRPC (Node.js)
│   ├── notify/                 # Email + in-app notifications (Node.js)
│   ├── intelligence/           # FX, rule engine (Python)
│   ├── web/                    # React SPA
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
└── CLAUDE.md                   # Project constitution for Claude Code
```

## Prerequisites

Install via [Homebrew](https://brew.sh/):

```bash
brew install bazelisk node@20 python@3.12 pnpm minikube kubectl skaffold
```

You also need a container runtime. We use [OrbStack](https://orbstack.dev/) (recommended for macOS):

```bash
brew install orbstack
```

Docker Desktop or Colima also work — minikube just needs a Docker-compatible socket.

| Tool | Version | Purpose |
|------|---------|---------|
| Bazelisk | latest | Bazel version manager (reads `.bazelversion`) |
| Node.js | 20+ | Backend services + gateway |
| Python | 3.12+ | Intelligence service |
| pnpm | 9+ | Node package manager |
| OrbStack | latest | Container runtime (Docker-compatible) |
| minikube | latest | Local Kubernetes cluster |
| kubectl | latest | Kubernetes CLI |
| Skaffold | latest | Dev loop — build, deploy, hot-reload on minikube |

## Local Kubernetes setup (minikube)

### 1. Start the cluster

```bash
minikube start --cpus=4 --memory=8192 --driver=docker
```

OrbStack's Docker socket is picked up automatically. If you have multiple Docker contexts, make sure OrbStack is the active one:

```bash
docker context use orbstack
```

### 2. Enable addons

```bash
minikube addons enable ingress
minikube addons enable storage-provisioner
```

### 3. Verify

```bash
minikube status
kubectl get nodes
```

You should see a single node in `Ready` state.

### 4. Access services

```bash
# Open the minikube dashboard
minikube dashboard

# Get the cluster IP for a service
minikube service <service-name> --url
```

### 5. Tear down

```bash
minikube stop     # pause the cluster (preserves state)
minikube delete   # destroy the cluster entirely
```

> **Coming in F0.2:** `make dev` will automate cluster setup + Skaffold deployment of all services with hot-reload. For now, these manual steps get you a running cluster.

## Make commands

| Command | Status | Description |
|---------|--------|-------------|
| `make help` | Ready | Show all available targets |
| `make build` | Ready | `bazel build //...` |
| `make test` | Ready | `bazel test //...` |
| `make lint` | F0.7 | Run ESLint, ruff, golangci-lint |
| `make fmt` | F0.7 | Auto-format (prettier, ruff, gofmt) |
| `make dev` | F0.2 | Start minikube + Skaffold dev stack |
| `make dev-infra` | F0.2 | Start infra only (Postgres, Redis, MinIO) |
| `make dev-down` | F0.2 | Tear down minikube |
| `make migrate` | F0.6 | Apply pending DB migrations |
| `make migrate-create svc=X name=Y` | F0.6 | Create a new migration file |
| `make proto` | F0.3 | Regenerate protobuf clients |
| `make manifests-validate` | F0.7 | Validate k8s manifests |

Stubbed targets print a message and exit cleanly. They'll be wired up as Phase 0 progresses.

## Service catalog

| Service | Language | Role |
|---------|----------|------|
| Proposal | Node.js | Pricing Proposal lifecycle — state machine, approvals, comments |
| Margin | Go | Margin rules, batch validation, breach detection |
| Repricing | Node.js | Bulk change-sets, scope builder, preview, scheduled rollouts |
| Governance | Node.js | Append-only audit log, version snapshots, restore (event subscriber only) |
| Catalog | Node.js | Canonical pricing data — products, SKUs, costs, prices, channels |
| Import/Export | Python | File ingest, column profiling, mapping, transformation, canonical commit |
| Gateway | Node.js | Edge — JWT auth, REST-to-gRPC, rate limiting |
| Notify | Node.js | Email + in-app notifications (event subscriber) |
| Intelligence | Python | FX calculator, margin rule engine (gRPC) |

## Development workflow

- **Branches:** `agent/<service>-<feature-id>` (e.g. `agent/margin-F3.2`)
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`)
- **PRs:** title references the BUILD_PLAN.md feature ID; description includes Definition-of-Done checklist
- **gRPC for internal calls**, REST only at the gateway
- **Events through `src/lib/bus`** — never import Redis/Kafka clients directly

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — system spec, data architecture, ADRs, sequence flows
- [BUILD_PLAN.md](BUILD_PLAN.md) — phased roadmap (F0-F7), agentic workflow, Definition of Done
- [CLAUDE.md](CLAUDE.md) — project constitution, conventions, invariants
- Per-service docs in `src/<service>/CLAUDE.md`
