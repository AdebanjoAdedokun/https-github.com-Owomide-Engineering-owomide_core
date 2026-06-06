# Proposal Service

The canonical writer of Pricing Proposals. Owns the lifecycle.

State machine: `draft → submitted → blocked | approved → published` with an override branch off `blocked`.

This is the hub. Margin validates for it. Repricing wraps change-sets in it. Governance audits it. Notify announces it. Everything else orbits.

---

## What this owns

- The `proposal` lifecycle and state machine.
- Approval logic, including separation-of-duties checks.
- The override request flow (`POST /override-requests`, different-actor enforcement).
- Comments and the proposal-level activity feed.
- All five `proposal.*` and `override.*` events on the bus.

## What this does not own

- Margin rules or validation logic → **Margin**.
- Price data, costs, SKUs → **Catalog**.
- Change-set composition → **Repricing**.
- Audit log → **Governance** (subscribes to our events).
- Notifications → **Notify** (subscribes).
- File uploads or import → **Import/Export**.

---

## Public contract

### gRPC methods

- `CreateProposal(CreateProposalRequest) → Proposal` — creates a `draft`.
- `GetProposal(GetProposalRequest) → Proposal` — single read.
- `ListProposals(ListProposalsRequest) → ListProposalsResponse` — paged, filterable by state, owner, date.
- `UpdateDraft(UpdateDraftRequest) → Proposal` — only valid in `draft` state.
- `SubmitProposal(SubmitRequest) → SubmitResponse` — runs margin validation; transitions to `submitted` or `blocked`. Returns violations on block.
- `ApproveProposal(ApproveRequest) → Proposal` — different-actor check; transitions to `approved`. Approver role required.
- `PublishProposal(PublishRequest) → Proposal` — `approved → published`. Triggers catalog price updates.
- `RequestOverride(OverrideRequest) → OverrideRequestResult` — creates override request on a `blocked` proposal.
- `ApproveOverride(ApproveOverrideRequest) → Proposal` — different actor than override requester.

### REST (via Gateway)

- `POST /proposals` → CreateProposal
- `GET /proposals/:id` → GetProposal
- `GET /proposals` → ListProposals
- `PATCH /proposals/:id` → UpdateDraft
- `POST /proposals/:id/submit` → SubmitProposal (returns 422 on margin block)
- `POST /proposals/:id/approve` → ApproveProposal
- `POST /proposals/:id/publish` → PublishProposal
- `POST /override-requests` → RequestOverride
- `POST /override-requests/:id/approve` → ApproveOverride

### Events emitted

- `proposal.submitted` — on `draft → submitted`
- `proposal.blocked` — on `submitted → blocked` (margin violations)
- `proposal.approved` — on `submitted → approved`
- `override.requested` — on new override request
- `override.approved` — on override approval (re-evaluates the blocked proposal)

### Events consumed

None. This service is upstream.

---

## Database (schema: `proposal`)

- `proposal` — id, state, owner_id, title, created_at, updated_at, change_set_ref (nullable, set if originated from Repricing).
- `proposal_line` — id, proposal_id, sku_id, channel_id, current_price, proposed_price, reason.
- `proposal_transition` — id, proposal_id, from_state, to_state, actor_id, at, meta JSONB. Append-only.
- `proposal_comment` — id, proposal_id, author_id, body, at.
- `override_request` — id, proposal_id, requester_id, justification, status, requested_at, approved_at (nullable), approver_id (nullable).

Postgres role `proposal_svc` has access to schema `proposal` only. Reads from Catalog via gRPC, not SQL.

---

## Dependencies

- **Margin** (gRPC) — `ValidateBatch` on submit. Always batched, never per-line.
- **Catalog** (gRPC) — `BatchGetSkus`, `BatchGetCosts` when building proposal context.
- **Bus** (Redis Streams) — emit events.

---

## Critical rules

1. **State transitions are atomic.** Use a Postgres transaction wrapping the state update and the transition-log insert.
2. **Approver must differ from owner.** Enforced server-side. Returns 403 if same actor.
3. **Override approver must differ from override requester.** Same rule, separate check.
4. **`blocked` returns HTTP 422**, not 400. The submission was syntactically valid; it failed a business rule.
5. **Never write to Catalog tables directly.** Publishing triggers a Catalog gRPC call to apply price changes.
6. **Override token does not bypass margin.** It's a recorded exception with a justification; margin still runs, the override evidence is logged.

---

## Definition of done (MVP)

- [ ] Schema migration applied
- [ ] State machine with all transitions covered by unit tests (including illegal transitions)
- [ ] gRPC server with all nine methods
- [ ] REST routes wired through the gateway
- [ ] `proposal.*` and `override.*` events published on transitions
- [ ] Integration test: full happy path (create → submit → approve → publish) against real Postgres + Margin stub
- [ ] Integration test: blocked path (submit returns 422 with violations)
- [ ] Integration test: override path (different actor, ends in approval)
- [ ] Integration test: same-actor approve attempt returns 403
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
    │   ├── state-machine.ts
    │   ├── separation-of-duties.ts
    │   └── override.ts
    ├── repo/                   (DB access)
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
