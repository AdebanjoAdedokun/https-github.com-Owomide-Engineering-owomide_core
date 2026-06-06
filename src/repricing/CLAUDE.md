# Repricing Service

Bulk price-change composer. Builds change-sets, computes previews, and hands the result off to Proposal for the actual lifecycle.

A change-set is a *draft*, not a proposal. It only becomes a Proposal on submit.

---

## What this owns

- Change-set composition: scope queries, line-by-line diffs, preview state.
- Scheduled rollout workers (delayed-apply queue keyed on `effective_at`).
- The scope DSL (filter syntax for selecting SKUs by channel, category, customer, tag, etc.).

## What this does not own

- The Proposal lifecycle → **Proposal** (we hand off, they own).
- Margin validation → **Margin** (called via Proposal, not directly by us).
- Catalog mutations → **Catalog** (only Proposal's publish step writes prices).
- Audit → **Governance** (subscribes to `proposal.*` events triggered by our hand-off).

---

## Public contract

### gRPC methods

- `BuildScope(BuildScopeRequest) → BuildScopeResponse`
  - Input: filter DSL (e.g. `{channel: "wholesale", category: "Spirits", customer_in: [...]}`).
  - Output: matched SKU list with current canonical prices.
- `PreviewChangeSet(PreviewRequest) → ChangeSet`
  - Input: scope + repricing rule (e.g. `{type: "pct_increase", value: 5.0}` or `{type: "absolute_set", price: 12.50}`).
  - Output: persisted draft change-set with computed proposed prices and diff.
- `GetChangeSet(GetRequest) → ChangeSet`
- `ListChangeSets(ListRequest) → ListResponse` — drafts only; submitted ones become Proposals.
- `UpdateChangeSet(UpdateRequest) → ChangeSet` — edit lines or scope; draft only.
- `SubmitChangeSet(SubmitRequest) → Proposal` — wraps in a Proposal via Proposal Service, deletes own draft state, returns the proposal_id.
- `DiscardChangeSet(DiscardRequest) → Empty` — abandons a draft.
- `ScheduleRollout(ScheduleRequest) → Proposal` — sets `effective_at` on an approved proposal's lines; worker handles the dispatch.

### REST (via Gateway)

- `POST /change-sets/scope` → BuildScope
- `POST /change-sets/preview` → PreviewChangeSet
- `GET /change-sets/:id` → GetChangeSet
- `GET /change-sets` → ListChangeSets
- `PATCH /change-sets/:id` → UpdateChangeSet
- `POST /change-sets/:id/submit` → SubmitChangeSet
- `DELETE /change-sets/:id` → DiscardChangeSet
- `POST /change-sets/:id/schedule` → ScheduleRollout

### Events emitted

None directly. The proposal-hand-off triggers `proposal.submitted` from Proposal Service.

### Events consumed

- `proposal.approved` — when a proposal that originated from us is approved, our scheduled rollout worker (if applicable) starts watching the `effective_at`.

---

## Database (schema: `repricing`)

- `change_set` — id, status (`draft` | `submitted` | `discarded`), owner_id, scope JSONB, rule JSONB, created_at, submitted_at (nullable), proposal_id (nullable, set on submit).
- `change_set_line` — id, change_set_id, sku_id, channel_id, current_price, proposed_price, diff_pct, diff_absolute, currency.
- `scheduled_rollout` — id, proposal_id, effective_at, status (`pending` | `dispatched` | `failed`), attempts, last_attempted_at.

Postgres role `repricing_svc` has access to schema `repricing` only.

---

## Dependencies

- **Catalog** (gRPC) — `ListSkus` with filters, `BatchGetPrices` for the diff calc.
- **Proposal** (gRPC) — `CreateProposal` on submit, transferring the change-set lines as proposal lines.
- **Bus** — consume `proposal.approved` for scheduled-rollout activation.

---

## Critical rules

1. **A change-set is not a proposal.** Drafts are local to Repricing. Only after submit does the data move to Proposal's schema. After submit, the change-set row stays in `submitted` state for traceability (line data lives in Proposal now).
2. **The diff is computed at preview time, not submit time.** A change-set captures a moment-in-time price comparison. Submitting much later is safe; the diff is informational.
3. **Scope DSL is versioned.** Store the scope payload as JSONB; never re-execute a saved scope without confirming it still resolves the same SKUs (or warning the user it changed).
4. **Scheduled rollouts respect approval order.** A proposal scheduled for next Monday but approved Tuesday morning runs immediately on dispatch; one scheduled for next Monday and approved last week waits.
5. **Never apply prices.** That's Catalog's job, triggered by Proposal's publish.

---

## Definition of done (MVP)

- [ ] Schema migration applied
- [ ] Scope DSL parser + validator (pure logic)
- [ ] gRPC server with all eight methods
- [ ] REST routes wired through gateway
- [ ] Integration test: build scope → preview → submit → see resulting proposal in Proposal Service
- [ ] Integration test: schedule rollout, worker dispatches at the right time (use fake clock)
- [ ] Integration test: edit a draft, re-preview, see updated diff
- [ ] `make lint` clean, `bazel test //src/repricing/...` green

---

## Files (target layout)

```
src/repricing/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
└── src/
    ├── server.ts
    ├── handlers/
    ├── domain/
    │   ├── scope-dsl.ts            (parser + executor, pure)
    │   ├── repricing-rules.ts      (pct/absolute/formula, pure)
    │   └── diff.ts
    ├── workers/
    │   └── scheduled-rollout.ts    (background loop)
    ├── clients/
    │   ├── catalog.ts
    │   └── proposal.ts
    ├── repo/
    └── tests/
```

---

## Conventions specific to this service

- The scope DSL grammar lives in `domain/scope-dsl.ts` and is versioned. Changes to the grammar require an explicit migration plan for stored scopes.
- The repricing rule application is a pure function: `apply(rule, current_price) → proposed_price`. Round-tripping it on the same input must be deterministic.
- Preview state lives only as long as it's useful. Discard drafts older than 30 days via a nightly job.
