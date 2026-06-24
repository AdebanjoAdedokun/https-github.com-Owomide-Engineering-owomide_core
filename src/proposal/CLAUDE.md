# Proposal Service

The canonical writer of Pricing Proposals. Owns the lifecycle and the bulk repricing flow.

State machine: `draft → submitted → blocked | approved → published` with an override branch off `blocked`.

This is the hub. Margin validates for it. Governance audits it. Notify announces it. Everything else orbits.

---

## What this owns

- The `proposal` lifecycle and state machine.
- Approval logic, including separation-of-duties checks.
- The override request flow (`POST /override-requests`, different-actor enforcement).
- Comments and the proposal-level activity feed.
- Org-scoped proposal access and state transitions.
- All six `proposal.*` and `override.*` events on the bus.
- **Bulk repricing**: scope DSL, change-set composition, preview state, scheduled rollouts.

## What this does not own

- Margin rules or validation logic → **Margin**.
- Price data, costs, SKUs → **Catalog**.
- Audit log → **Governance** (subscribes to our events).
- Notifications → **Notify** (subscribes).
- File uploads or import → **Data Pipeline**.

---

## Public contract

### gRPC methods

#### Proposal lifecycle

- `CreateProposal(CreateProposalRequest) → Proposal` — creates a `draft`.
- `GetProposal(GetProposalRequest) → Proposal` — single read.
- `ListProposals(ListProposalsRequest) → ListProposalsResponse` — paged, filterable by state, owner, date.
- `UpdateDraft(UpdateDraftRequest) → Proposal` — only valid in `draft` state.
- `SubmitProposal(SubmitRequest) → SubmitResponse` — runs margin validation; transitions to `submitted` or `blocked`. Returns violations on block.
- `ApproveProposal(ApproveRequest) → Proposal` — different-actor check; transitions to `approved`. Approver role required.
- `PublishProposal(PublishRequest) → Proposal` — `approved → published`. This is the only proposal transition that triggers Catalog price updates.
- `RequestOverride(OverrideRequest) → OverrideRequestResult` — creates override request on a `blocked` proposal.
- `ApproveOverride(ApproveOverrideRequest) → Proposal` — different actor than override requester.

#### Bulk repricing (scope builder + change-sets)

- `BuildScope(BuildScopeRequest) → BuildScopeResponse` — input: filter DSL (channel, category, customer, tag); output: matched SKU list with current canonical prices.
- `PreviewChangeSet(PreviewRequest) → ChangeSet` — input: scope + repricing rule (e.g. `{type: "pct_increase", value: 5.0}`); output: persisted draft change-set with computed proposed prices and diff.
- `GetChangeSet(GetRequest) → ChangeSet`
- `ListChangeSets(ListRequest) → ListResponse` — drafts only; submitted ones become Proposals.
- `UpdateChangeSet(UpdateRequest) → ChangeSet` — edit lines or scope; draft only.
- `SubmitChangeSet(SubmitRequest) → Proposal` — wraps change-set in a Proposal, transitions change-set to `submitted`, returns proposal_id.
- `DiscardChangeSet(DiscardRequest) → Empty` — abandons a draft.
- `ScheduleRollout(ScheduleRequest) → Proposal` — sets `effective_at` on an approved proposal's lines; worker handles the dispatch.

### REST (via Gateway)

#### Proposal lifecycle

- `POST /proposals` → CreateProposal
- `GET /proposals/:id` → GetProposal
- `GET /proposals` → ListProposals
- `PATCH /proposals/:id` → UpdateDraft
- `POST /proposals/:id/submit` → SubmitProposal (returns 422 on margin block)
- `POST /proposals/:id/approve` → ApproveProposal
- `POST /proposals/:id/publish` → PublishProposal
- `POST /override-requests` → RequestOverride
- `POST /override-requests/:id/approve` → ApproveOverride

#### Bulk repricing

- `POST /proposals/scope` → BuildScope
- `POST /proposals/preview` → PreviewChangeSet
- `GET /change-sets/:id` → GetChangeSet
- `GET /change-sets` → ListChangeSets
- `PATCH /change-sets/:id` → UpdateChangeSet
- `POST /change-sets/:id/submit` → SubmitChangeSet
- `DELETE /change-sets/:id` → DiscardChangeSet
- `POST /proposals/:id/schedule` → ScheduleRollout

### Events emitted

- `proposal.submitted` — on `draft → submitted`
- `proposal.blocked` — on `submitted → blocked` (margin violations)
- `proposal.approved` — on `submitted → approved`
- `proposal.published` — on `approved → published`
- `override.requested` — on new override request
- `override.approved` — on override approval (re-evaluates the blocked proposal)

### Events consumed

- `proposal.approved` — the scheduled rollout worker listens for approvals on proposals that have a scheduled `effective_at`; dispatches publish at the scheduled time.

---

## Database (schema: `proposal`)

### Proposal tables

- `proposal` — id, org_id, state, owner_id, title, created_at, updated_at, change_set_id (nullable, set if originated from bulk repricing).
- `proposal_line` — id, org_id, proposal_id, sku_id, channel_id, current_price, proposed_price, reason.
- `proposal_transition` — id, org_id, proposal_id, from_state, to_state, actor_id, at, meta JSONB. Append-only.
- `proposal_comment` — id, org_id, proposal_id, author_id, body, at.
- `override_request` — id, org_id, proposal_id, requester_id, justification, status, requested_at, approved_at (nullable), approver_id (nullable).

### Bulk repricing tables

- `change_set` — id, org_id, status (`draft` | `submitted` | `discarded`), owner_id, scope JSONB, rule JSONB, created_at, submitted_at (nullable), proposal_id (nullable, set on submit).
- `change_set_line` — id, org_id, change_set_id, sku_id, channel_id, current_price, proposed_price, diff_pct, diff_absolute, currency.
- `scheduled_rollout` — id, org_id, proposal_id, effective_at, status (`pending` | `dispatched` | `failed`), attempts, last_attempted_at.

Postgres role `proposal_svc` has access to schema `proposal` only. Reads from Catalog via gRPC, not SQL.

---

## Dependencies

- **Margin** (gRPC) — `ValidateBatch` on submit. Always batched, never per-line.
- **Catalog** (gRPC) — `BatchGetSkus`, `BatchGetCosts`, `BatchGetPrices`, `ListSkus` when building proposal context or computing scope/preview diffs.
- **Bus** (Kafka) — emit and consume events.

---

## Critical rules

1. **State transitions are atomic.** Use a Postgres transaction wrapping the state update and the transition-log insert.
2. **Every proposal query is scoped by `org_id`.** The org comes from authenticated request context, never from a user-editable body field.
3. **Approver must differ from owner.** Enforced server-side. Returns 403 if same actor.
4. **Approval is not publish.** Approval records authorization and emits `proposal.approved`; Catalog remains unchanged.
5. **Publish is the only Catalog mutation.** `PublishProposal` requires `approved`, calls Catalog `ApplyPriceChanges`, emits `proposal.published`, then moves the proposal to `published`.
6. **Override approver must differ from override requester.** Same rule, separate check.
7. **`blocked` returns HTTP 422**, not 400. The submission was syntactically valid; it failed a business rule.
8. **Never write to Catalog tables directly.** Publishing triggers a Catalog gRPC call to apply price changes.
9. **Override token does not bypass margin.** It's a recorded exception with a justification; margin still runs, the override evidence is logged.
10. **A change-set is not a proposal.** Drafts are local to the bulk repricing domain. Only after submit does the data move into proposal tables. After submit, the change-set row stays in `submitted` state for traceability.
11. **The diff is computed at preview time, not submit time.** A change-set captures a moment-in-time price comparison.
12. **Scope DSL is versioned.** Store the scope payload as JSONB; never re-execute a saved scope without confirming it still resolves the same SKUs.
13. **Scheduled rollouts respect approval order.** A proposal scheduled for next Monday but approved Tuesday morning publishes immediately on dispatch.

---

## Definition of done (MVP)

- [ ] Schema migration applied with `org_id` on all customer-owned proposal and change-set tables
- [ ] State machine with all transitions covered by unit tests (including illegal transitions)
- [ ] gRPC server with all seventeen methods (9 proposal + 8 bulk repricing)
- [ ] REST routes wired through the gateway
- [ ] `proposal.*` and `override.*` events published on transitions
- [ ] Scope DSL parser + validator (pure logic)
- [ ] Integration test: full happy path (create → submit → approve → publish) against real Postgres + Margin stub
- [ ] Integration test: blocked path (submit returns 422 with violations)
- [ ] Integration test: override path (different actor, ends in approval)
- [ ] Integration test: same-actor approve attempt returns 403
- [ ] Integration test: build scope → preview → submit → see resulting proposal
- [ ] Integration test: schedule rollout, worker dispatches at the right time (use fake clock)
- [ ] `make lint` clean, `bazel test //src/proposal/...` green

---

## Files (target layout)

```
src/proposal/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
│   └── 0001_initial.sql
├── proto/                      (symlink or import from src/lib/proto)
└── src/
    ├── server.ts               (gRPC bootstrap)
    ├── handlers/               (one file per RPC method)
    ├── domain/
    │   ├── state-machine.ts    (pure — no I/O)
    │   ├── separation-of-duties.ts
    │   ├── override.ts
    │   ├── scope-dsl.ts        (parser + executor, pure)
    │   ├── repricing-rules.ts  (pct/absolute/formula, pure)
    │   └── diff.ts             (price diff calculator)
    ├── workers/
    │   └── scheduled-rollout.ts (background loop)
    ├── repo/                   (DB access)
    ├── clients/
    │   └── catalog.ts          (gRPC client)
    ├── events/                 (bus publishers)
    └── tests/
        ├── integration/
        └── unit/
```

---

## Conventions specific to this service

- The state machine is pure logic — no I/O. It takes a current state + event + context and returns the next state plus the side-effects to perform. Handlers execute the side-effects in a transaction.
- Never enrich proposals with margin data on read. The proposal stores its own snapshot at submit time; live margin data goes through Margin Service.
- Error envelope: `{ code, message, violations? }`. Violations only present on margin-block 422 responses.
- The scope DSL grammar lives in `domain/scope-dsl.ts` and is versioned. Changes to the grammar require an explicit migration plan for stored scopes.
- The repricing rule application is a pure function: `apply(rule, current_price) → proposed_price`. Round-tripping it on the same input must be deterministic.
- Preview state lives only as long as it's useful. Discard drafts older than 30 days via a nightly job.
