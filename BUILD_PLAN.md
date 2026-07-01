# Owomide Build Plan

How we get from architecture diagrams to a shipped product, using Claude Code agents.

This file is a working document. Update it as features ship.

---

## 1 · The agentic workflow — the meta

Before we list features, here's how to actually build them with agents.

### 1.1 Six rules

1. **Slice vertically, not horizontally.** A feature is a thin end-to-end pass through the stack (DB → service → gateway → UI), not "all migrations" then "all APIs" then "all UIs". Vertical slices ship value and surface integration problems early.

2. **Contracts before implementation.** Every feature that crosses a service boundary starts with a protobuf or event schema change in `src/lib/proto/`. The contract is the agreement; producers and consumers can then be built in parallel.

3. **One agent → one branch → one PR → one feature.** Don't multitask one agent across features. Worktrees (`git worktree add ../wt-<feature> agent/<feature>`) let you run multiple agent sessions in parallel without conflicts.

4. **Plan Mode before code.** For anything non-trivial, use Claude Code's Plan Mode (Shift+Tab) to draft the approach. Review the plan, then accept. This catches bad designs before they become bad code.

5. **Definition of Done is non-negotiable.** Every feature has the same DoD checklist (section 1.3). A PR is not merge-ready until every box is ticked, even if the boxes feel pedantic.

6. **The CLAUDE.md files are the agent's onboarding doc.** Keep them accurate. When an agent learns something the docs didn't tell it, that's a CLAUDE.md update — propose it as part of the PR.

### 1.2 Subagent specialisation

Claude Code supports subagents — focused personas for specific work. Recommended set, all configured in `.claude/agents/`:

- **architect** — reads `ARCHITECTURE.md` + relevant service CLAUDE.md files, designs contracts, drafts proto changes. Does not write implementation code.
- **schema** — owns DB migrations. Reviews for safety (no destructive defaults, no implicit data loss, indexes considered). Writes migration + rollback.
- **implementer** — writes the service code against an accepted contract. Tests as it goes.
- **tester** — writes integration tests against the real stack (testcontainers Postgres, real Redis). Covers happy path + key failure modes.
- **reviewer** — final pass against the DoD checklist before PR. Reads the diff, runs the tests, flags inconsistencies with CLAUDE.md.

Data-heavy and cross-cutting work should also use the specialized repo agents:

- **data-architect** — reviews Catalog, tenant boundary, price history, import-to-canonical contracts, and analytics-readiness decisions.
- **schema-reviewer** — reviews migrations for tenant isolation, indexes, constraints, rollback safety, and append-only pricing semantics.
- **import-pipeline** — reviews CSV/XLSX ingestion, mapping templates, validation events, partial-fail behavior, and canonical commit.
- **event-contract** — reviews event proto changes, bus integration, idempotency, and cross-language wire format.
- **proposal-reviewer** — reviews state machine transitions, approval logic, bulk repricing, overrides, and scheduled rollouts.
- **api-contract** — reviews gRPC/REST contract changes, gateway routing, and cross-service dependencies.
- **security-reviewer** — reviews auth, org_id tenant isolation, DB roles, and data exposure.

A typical feature run: **architect** drafts → human reviews → **schema** writes migration → **implementer** writes service code → **tester** writes integration tests → **reviewer** runs DoD → PR opens.

For small features, one agent can wear all the hats. The point is the *order*, not the role count.

### 1.3 Definition of Done — universal

Every feature PR must include:

- [ ] Contract committed (proto / event schema / OpenAPI as applicable)
- [ ] DB migration committed (if schema changed), with rollback tested
- [ ] Implementation
- [ ] Unit tests for pure logic
- [ ] Integration test that exercises the real path (real Postgres, real Redis, adjacent services either real or stubbed against their proto)
- [ ] CLAUDE.md updated where behavior or contract shifted (root or service-level)
- [ ] `make lint` clean
- [ ] `bazel test //...` green
- [ ] PR description references the feature ID from this file and the DoD checkboxes

### 1.4 Feature task template

When you give an agent a feature to build, the prompt has a consistent shape. Example:

> **Feature:** F4.2 — `Margin.validateBatch` gRPC method.
> **Service:** `src/margin`.
> **Read first:** `ARCHITECTURE.md` §2 (Margin), `src/margin/CLAUDE.md`, `src/lib/proto/margin/v1/margin.proto`.
> **What to build:** Implement the `ValidateBatch(skus[]) → violations[]` gRPC handler. Loads rules from `margin.rule`, costs from Catalog via gRPC (do not bypass), returns structured violations.
> **Don't build:** The Proposal-side integration (that's F4.3). The below-cost UX (F4.5).
> **DoD:** Standard checklist applies.
> **Open questions:** None. If you discover one, stop and ask.

Pasting this template into a new chat (or piping it through Claude Code's `--print` mode for fully unattended runs) gives the agent everything it needs.

### 1.5 Tooling reminders

- **Plan Mode** (Shift+Tab in Claude Code) — drafts a plan before writing files.
- **Worktrees** — `git worktree add ../wt-feature-id agent/feature-id` for parallel work.
- **`/memory`** — inspect which CLAUDE.md files Claude has loaded in the current session.
- **Slash commands** — put repeatable workflows (e.g. `/new-migration`, `/run-integration`) in `.claude/commands/`.
- **CLAUDE.local.md** — git-ignored, your personal notes / sandbox URLs / TODO scratchpad.

---

## 2 · Phased roadmap

Eight phases. Each phase has 5-9 features. Features are sized so a focused agent session (one or two days of human attention) can complete one.

The phases are not strict gates — once Phase 0 is done, parts of Phase 1, Phase 2, and Phase 3 can run in parallel. But the order represents dependency: don't start Phase 4 (Margin) before Phase 1 (Catalog) is real, because Margin reads from Catalog. Phase 2 (Import) is a parallel track, not a dependency of Phase 3+ — see note there.

### Phase 0 — Foundation

The skeleton everything sits on. Build this first, ship nothing user-visible, get the dev loop working.

| ID | Feature | Notes |
|---|---|---|
| F0.1 | Bazel monorepo scaffold | `WORKSPACE.bazel`, root `BUILD.bazel`, `src/` (services + packages), `tools/` (bazel macros, deploy manifests, scripts). Rules for Node + Python; rules for Go pre-registered but unused. |
| F0.2 | **Minikube + Skaffold dev stack** | k8s manifests for Postgres, Redis, MinIO, and a hello-world service; Skaffold for hot reload; `make dev` brings up the cluster; Kustomize overlays for `local` / `staging` / `prod`. Manifests live in `infra/k8s/` within this repo — extraction to a dedicated `owomide_infra` repo is deferred until GitOps tooling (ArgoCD/Flux) lands; see `FUTURE.md`. |
| F0.3 | Shared proto package | `src/lib/proto/{events,services}` with the locked events. Every customer-owned event includes `org_id`. Cross-language codegen (Node, Python; Go later). |
| F0.4 | Gateway / BFF skeleton | Node, JWT verify, route table, gRPC client factory |
| F0.5 | **Event bus library (Kafka)** | `src/lib/bus` — uniform `Publisher` / `Subscriber` contract across **three native implementations**: Node.js (`js/`), Python (`py/`), and Go (`go/`). Kafka provider from day one in all three languages. Cross-language interop test mandatory. See `src/lib/bus/CLAUDE.md`. |
| F0.6 | Per-service migration runner | `make migrate svc=<name>`; isolated Postgres roles created from a manifest |
| F0.7 | CI pipeline | GitHub Actions: `bazel test //...`, lint (TS / Python), container image build per service, **k8s manifest validation** (`kubeval` / `kustomize build`), **DB migration step** (`make migrate` via `.github/workflows/migrate.yml` on push to `main`; reads `DATABASE_URL` + `*_SVC_PASSWORD` from GitHub Actions secrets per environment; idempotent so safe to run on every merge), no deploy yet |
| F0.8 | Auth scaffolding | JWT issue + verify, single hardcoded user for dev |
| F0.9 | **Bus smoke test across services** | A test service publishes `test.ping`; another consumes it; integration test asserts end-to-end delivery via `src/lib/bus`. Proves the abstraction works before Phase 1 leans on it. |

**Phase 0 exit criteria:** `make dev` brings up the full stack on OrbStack (including Kafka). `bazel test //...` passes (on empty services). CI green on `main`. **A test event published via `src/lib/bus` is received by a subscriber in another service** — proves the abstraction works end-to-end before any real feature depends on it.

### Phase 1 — Catalog

Without canonical pricing data, nothing else matters. Owned by the core team (Joshua).

| ID | Feature | Notes |
|---|---|---|
| F1.1 | Catalog schema | `products`, `skus`, `cost_records`, `price_records`, `channels`, `locations`; every customer-owned table includes `org_id`; cost/price records include `effective_at`, `effective_until`, `recorded_at`, and `superseded_at` |
| F1.2 | Catalog read APIs | gRPC: `GetProduct`, `GetSku`, `ListSkus`, `BatchGetCosts` |
| F1.3 | Seed fixtures | Realistic test data (~1k SKUs across 3 channels, sample orgs, users) for integration tests + demos. Prerequisite for Phase 2 (Import) and Phase 3 (Proposal) alike — both build against these fixtures independent of each other. |

**Phase 1 exit criteria:** Catalog schema is live, read APIs return data, seed fixtures are queryable end-to-end. This is the only hard gate for Phase 3+; Phase 2 (Import) is not required to be done first.

### Phase 2 — Import (Data Pipeline)

Owned by the Data Pipeline track (data engineer), built in parallel with Phase 3 onward — **not a sequential gate**. Proposal and downstream phases read canonical Catalog tables directly and depend only on Phase 1's seed fixtures, not on a working Import pipeline. This phase exists so a real CSV → committed canonical record path works, in parallel with core-team work on Proposal/Margin/etc.

| ID | Feature | Notes |
|---|---|---|
| F2.1 | Import schema | `import_batch`, `import_row` (raw_data + mapped_data JSONB), `validation_event`, `mapping_template`; import batches and templates are scoped by `org_id` |
| F2.2 | File upload endpoint | Gateway → Import; stores original to MinIO; creates ImportBatch; streams rows into raw_data |
| F2.3 | ColumnProfiler | Detects headers, types, samples, currency hints; returns suggested mappings |
| F2.4 | Mapping UI + save template | SPA flow; persisted as `MappingTemplate` keyed on customer/channel |
| F2.5 | TransformationRules + ValidationEvents | FX, tax, units, pack-size, discounts; row-level errors and warnings written to DB |
| F2.6 | CanonicalCommit | Upsert validated rows into Catalog; emit `import.committed` |

**Phase 2 exit criteria:** Upload a real customer CSV → see profile → apply mapping → see validation report → commit → query Catalog and see canonical rows. `import.committed` lands on the bus. Restart-safe.

### Phase 3 — Proposal core (includes bulk repricing)

The hub everything else attaches to. State machine first; pretty UI later. Repricing (scope builder, change-sets, preview, scheduled rollouts) lives inside Proposal as a module — not a separate service.

| ID | Feature | Notes |
|---|---|---|
| F3.1 | Proposal schema | `proposal`, `proposal_line`, `proposal_comment`, `proposal_event`; every table carries `org_id` |
| F3.2 | State machine | `draft → submitted → blocked|approved → published`, with override branch; persisted in `proposal.state` + transition log |
| F3.3 | CRUD APIs | gRPC: `CreateProposal`, `GetProposal`, `UpdateDraft`, `ListProposals` |
| F3.4 | Submit endpoint | Validates state precondition; emits `proposal.submitted`; no margin check yet (stub returns "no violations") |
| F3.5 | Approve endpoint | Role check; emits `proposal.approved`; moves to `approved`; does not mutate Catalog |
| F3.6 | Publish endpoint | Requires `approved`; calls Catalog `ApplyPriceChanges`; emits `proposal.published`; moves to `published` |
| F3.7 | Comments + activity feed | `POST /proposals/:id/comments`, append-only |
| F3.8 | Web UI: list + detail | Minimal — list with status filter, detail with state actions |

**Phase 3 exit criteria:** A user can create a proposal, submit it, have it approved by a different user, publish it, and see comments. Events fire, including `proposal.published`. Governance receives them (logged only — Phase 6 builds the audit UI).

### Phase 4 — Margin (theme 1)

Now Proposal grows teeth. Below-cost prevents bad submissions; override is the escape valve.

| ID | Feature | Notes |
|---|---|---|
| F4.1 | Margin rule schema + admin API | `margin_rule` (scope: channel/category/SKU; floor: % or absolute) |
| F4.2 | `Margin.ValidateBatch` gRPC | Batched only — see ADR-006. Returns structured violations |
| F4.3 | Wire Margin into Proposal submit | On submit, call ValidateBatch; on violations, move to `blocked` + emit `proposal.blocked` + HTTP 422 |
| F4.4 | Margin breach monitor | Background job: scans recent prices, surfaces breaches via event |
| F4.5 | Web UI: violations panel | Inline error list on proposal detail; below-cost flag per line |
| F4.6 | Override request endpoint | `POST /override-requests`; cannot be approved by same actor (server-side check) |
| F4.7 | Override approval flow | Approver path; emit `override.requested` + `override.approved`; proposal re-evaluates with override token |

**Phase 4 exit criteria:** Submitting a below-cost proposal blocks it. Requesting an override and having a different user approve it lets the proposal proceed. All steps appear in Governance's audit table.

### Phase 5 — Bulk Repricing (theme 2, inside Proposal service)

Bulk operations. The key trick: preview is a draft change-set, not a proposal. All code lives in `src/proposal/` — Repricing is a module, not a service.

| ID | Feature | Notes |
|---|---|---|
| F5.1 | Change-set schema | `change_set`, `change_set_line` (sku, old_price, new_price, reason) — tables in `proposal` schema |
| F5.2 | Scope builder | gRPC: query Catalog with filters (channel, category, customer, tag) → returns SKU list |
| F5.3 | Preview endpoint | Given a scope + price rule, compute diff vs. current canonical prices; persist as draft change-set |
| F5.4 | Commit endpoint | Wraps change-set in a new Proposal (transfers ownership), deletes draft state |
| F5.5 | Scheduled rollouts | Delayed-apply worker keyed on `effective_at` |
| F5.6 | Web UI: change-set builder + diff view | Scope wizard, preview table, submit-as-proposal button |

**Phase 5 exit criteria:** A user can build a 500-SKU change-set, preview the diff, submit it, have it approved, and see the canonical prices update at the scheduled time.

### Phase 6 — Governance (theme 3)

The audit layer. Read-only API; write path is purely the event bus.

| ID | Feature | Notes |
|---|---|---|
| F6.1 | Audit log schema | `audit_log` (append-only; org_id, event_type, actor, payload JSONB, occurred_at) |
| F6.2 | Event subscriber | Consumes all locked events; idempotent on `event_id`; stores `org_id` for every customer-owned event |
| F6.3 | Version snapshots | Periodic snapshot of canonical state (Catalog tables) for restore |
| F6.4 | Restore endpoint | Replays from snapshot + log up to a target timestamp |
| F6.5 | Web UI: activity feed | Reverse-chronological event list, filterable by entity + actor |
| F6.6 | Web UI: audit trail viewer | Per-proposal full history (all transitions, comments, override events) |

**Phase 6 exit criteria:** Every state change in the system is queryable from the activity feed. Restore from a 24-hour-old snapshot works on a staging environment.

### Phase 7 — Polish + intelligence

The nice-to-haves that move the product from "works" to "feels finished". Data Pipeline intelligence work (F7.3, F7.4) is the same ownership track as Phase 2 (Import) — same team, different phase.

| ID | Feature | Notes |
|---|---|---|
| F7.1 | Notify service | Email (Zoho ZeptoMail) + in-app banner; subscriber on all events |
| F7.2 | Export packs per channel | CSV / XLSX builders, signed S3 URLs |
| F7.3 | Data Pipeline intelligence: FX calculator | Python gRPC; called by Data Pipeline TransformationRules (lives in `src/data-pipeline/intelligence/`) |
| F7.4 | Data Pipeline intelligence: margin rule engine | Python gRPC; offloads complex rule evaluation from Margin (lives in `src/data-pipeline/intelligence/`) |
| F7.5 | UI polish | Loading states, error states, empty states, keyboard shortcuts |
| F7.6 | Performance | Catalog query caching, batched gRPC calls, Postgres index review |

**Phase 7 exit criteria:** Public-beta-ready. Real customer can self-serve the full happy path without hand-holding.

### Phase 8 — Hardening (open-ended)

- Org administration UI and enterprise tenant-management hardening
- SSO / SAML
- Customer-facing API
- Webhooks
- ML pricing optimization
- **Helm adoption** — introduce Helm for heavyweight third-party dependencies (production-grade Kafka, Postgres HA, observability stack like Prometheus + Grafana, cert-manager). Use official vendor charts via `helm install` rather than hand-writing those manifests. Kustomize stays the tool for Owomide's own first-party manifests. Optionally: package Owomide itself as a Helm chart for enterprise self-host deployments.

Not on the MVP critical path; gated on customer signal.

---

## 3 · Sequencing rules

- **F0.* must complete first.** Nothing else builds without it.
- **F1.* (Catalog) is the next gate.** Margin, Proposal, and Repricing all read from Catalog.
- **F2.* (Import) is a parallel track, not a gate.** Owned by Data Pipeline; runs alongside F3+ once F1's seed fixtures exist. Nothing in F3-F7 depends on F2 being done.
- **F3.* (Proposal core) before any theme.** The themes attach to Proposal.
- **F4, F5, F6 can run partially in parallel.** Margin (F4) is the most coupled to Proposal so do it first; Bulk Repricing (F5, inside Proposal) and Governance (F6) can interleave.
- **F7 always last.** Polish on a working system, not a half-built one.

---

## 4 · How to kick off an agent on a feature

Concrete recipe:

```bash
# 1. Create a worktree for the feature
git worktree add ../owomide-F3.2 agent/F3.2-margin-validate-batch

# 2. cd into it and open Claude Code
cd ../owomide-F3.2
claude

# 3. Paste the feature task template (see §1.4)

# 4. Use Plan Mode (Shift+Tab) - have Claude draft the approach first

# 5. Review the plan. Accept or refine.

# 6. Let it execute. Watch the tests run.

# 7. When DoD ticks green, open the PR.
```

For fully unattended runs (small features, high confidence), use `claude --print` mode with the same task template piped in.

---

## 5 · What to measure

- **Cycle time per feature** (kickoff → merged PR). Target: < 2 days median for Phase 1-2 features.
- **DoD violations caught in review.** Trending down means the agents are internalising the rules; trending up means CLAUDE.md needs sharpening.
- **CLAUDE.md drift.** How often does an agent get something wrong because the file was stale? Each instance is a doc-update PR.
- **Integration test runtime.** If `bazel test //...` blows past 5 minutes locally, the dev loop is breaking — prioritise speed.

---

## 6 · Next concrete step

Run Phase 0 in order: F0.1 → F0.2 → F0.3 → F0.4 → F0.5 → F0.6 → F0.7 → F0.8 → F0.9. These are sequential — each depends on the previous. Plan on one agent session per feature; total ~4-6 days of focused work to a green dev loop with a working bus.

After F0.9, fan out: Catalog (F1.1, F1.2, F1.3) and Import (F2.1, F2.2), Data Pipeline's track, can run in parallel worktrees — they only meet where Import's canonical commit (F2.6) writes into Catalog's tables (F1.1).
