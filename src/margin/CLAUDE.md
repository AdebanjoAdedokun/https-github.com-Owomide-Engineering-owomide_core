# Margin Service

Stateless validation of prices against margin floors and rules.

The job is simple: given a batch of SKUs and proposed prices, return a list of violations. Callers decide what to do with them.

---

## What this owns

- Margin rule definitions and storage (`margin_rule` table).
- The `ValidateBatch` validation engine.
- Background margin-breach monitor (scans recent canonical prices, emits breach signals).
- Org-scoped rule lookup and validation.

## What this does not own

- The proposal lifecycle → **Proposal** (we're called by it, we don't drive it).
- The HTTP 422 response — Proposal wraps our violations in the response. We just return the list.
- The override flow → **Proposal**.
- Cost data → **Catalog** (we fetch via gRPC).
- Audit → **Governance** (subscribes to our breach signals if/when we emit them).

---

## Public contract

### gRPC methods

- `ValidateBatch(ValidateBatchRequest) → ValidateBatchResponse`
  - **Input:** array of `{sku_id, channel_id, proposed_price, currency}`.
  - **Output:** array of `Violation` objects: `{sku_id, rule_id, severity, message, floor, proposed, gap}`.
  - `org_id` comes from authenticated gRPC metadata, not from the body.
  - **Severity:** `block` (below cost or below floor) or `warn` (within margin of floor).
  - **Never returns per-SKU.** Always batched.
- `ListRules(ListRulesRequest) → ListRulesResponse` — admin read.
- `UpsertRule(UpsertRuleRequest) → MarginRule` — admin write.
- `DeactivateRule(DeactivateRuleRequest) → MarginRule` — soft-delete; rules are versioned by `effective_at`.

### REST (via Gateway, admin-only)

- `GET /margin/rules`
- `POST /margin/rules`
- `PATCH /margin/rules/:id`
- `DELETE /margin/rules/:id` (soft)

### Events emitted

- (Phase 3.4) `margin.breach_detected` — from the monitor, when a recently committed canonical price is below floor. **Not in the locked-events list** since it's an internal alert, not part of the proposal lifecycle.

### Events consumed

None. Pure RPC service.

---

## Database (schema: `margin`)

- `margin_rule` — id, org_id, scope (channel_id, category_id, sku_id — any may be null for broader scope), floor_type (`pct_margin`, `pct_markup`, `absolute_minimum`), floor_value, currency, effective_at, effective_until, created_by, version.
- `margin_rule_application` — id, org_id, rule_id, proposal_id, proposal_line_id, applied_at, meta JSONB; log of which rule applied to which validation, for transparency.

Postgres role `margin_svc` has access to schema `margin` only.

---

## Dependencies

- **Catalog** (gRPC) — `BatchGetCosts(sku_ids[])` to fetch current costs for floor calculation.
- That's it. No bus subscriptions.

---

## Critical rules

1. **Batched only.** Reject single-SKU requests at the API level. If a caller needs to validate one SKU, they wrap it in a one-element batch.
2. **Every rule lookup is scoped by `org_id`.** A request cannot validate one org's proposed prices against another org's margin rules or costs.
3. **Costs are read at validation time.** Use Catalog as-of reads to pick the right historical row. This makes validation reproducible after the fact.
4. **Rule precedence:** most specific wins. A rule scoped to `(sku_id=X)` beats `(channel_id=Y)` beats `(category_id=Z)` beats an org-wide rule.
5. **Return violations, never decisions.** Don't return `{blocked: true}`. Return `severity` and let Proposal decide.
6. **Currency mismatch is a `block` violation**, not an error. The proposed price's currency must match the rule's currency; otherwise the line cannot be evaluated.
7. **Stateless server.** No session, no per-request caching beyond an in-process LRU for rule lookups (with TTL).

---

## Definition of done (MVP)

- [x] Schema migration applied with `org_id` on margin-owned customer data (`margin_rule` + `margin_rule_application`, RLS, org-scoped indexes) (F4.1)
- [x] `ListRules`, `UpsertRule`, `DeactivateRule` gRPC handlers with org-scoped RLS; Go module scaffolded (F4.1)
- [x] `buf.gen.yaml` updated with `grpc/go` plugin; `margin_grpc.pb.go` generated (F4.1)
- [x] Integration tests: 5 scenarios, real Postgres via dockertest + in-process gRPC (F4.1)
- [x] `ValidateBatch` gRPC handler implemented (F4.2)
- [x] Rule precedence resolved in pure logic + unit-tested (F4.2)
- [x] Catalog `BatchGetCosts` client wired via `CostFetcher` interface (F4.2)
- [x] Integration test: batch with mixed violations and clean lines returns structured violations (F4.2)
- [x] Integration test: empty items rejected at API boundary with `InvalidArgument` (F4.2)
- [ ] Admin REST routes for rule CRUD
- [ ] `make lint` clean, `bazel test //src/margin/...` green

---

## Files (target layout)

```
src/margin/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── handler/
│   │   ├── validate_batch.go
│   │   └── rules.go
│   ├── domain/
│   │   ├── rule_resolver.go        (precedence logic, pure)
│   │   ├── floor_calculator.go     (pct margin / markup / absolute, pure)
│   │   └── violation.go
│   ├── repo/
│   └── client/
│       └── catalog.go              (gRPC client to Catalog)
└── internal_test/
```

---

## Conventions specific to this service

- The rule resolver and floor calculator are pure functions with deterministic outputs. They have no DB access. The handler fetches inputs (rules, costs) and feeds them in.
- Violations include a `gap` field — how far below the floor (in the rule's units). Useful for sorting in the UI.
- Never log proposed prices alongside identifiable customer/user data.
