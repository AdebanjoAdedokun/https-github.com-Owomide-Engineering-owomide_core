# Margin Service

Stateless validation of prices against margin floors and rules.

The job is simple: given a batch of SKUs and proposed prices, return a list of violations. Callers decide what to do with them.

---

## What this owns

- Margin rule definitions and storage (`margin_rule` table).
- The `ValidateBatch` validation engine.
- Background margin-breach monitor (scans recent canonical prices, emits breach signals).

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

- `margin_rule` — id, scope (channel_id, category_id, sku_id — any may be null for broader scope), floor_type (`pct_margin`, `pct_markup`, `absolute_minimum`), floor_value, currency, effective_at, effective_until, created_by, version.
- `margin_rule_application` — log of which rule applied to which validation, for transparency.

Postgres role `margin_svc` has access to schema `margin` only.

---

## Dependencies

- **Catalog** (gRPC) — `BatchGetCosts(sku_ids[])` to fetch current costs for floor calculation.
- That's it. No bus subscriptions.

---

## Critical rules

1. **Batched only.** Reject single-SKU requests at the API level. If a caller needs to validate one SKU, they wrap it in a one-element batch.
2. **Costs are read at validation time.** Use the cost's `effective_at` to pick the right historical row. This makes validation reproducible after the fact.
3. **Rule precedence:** most specific wins. A rule scoped to `(sku_id=X)` beats `(channel_id=Y)` beats `(category_id=Z)` beats a global rule.
4. **Return violations, never decisions.** Don't return `{blocked: true}`. Return `severity` and let Proposal decide.
5. **Currency mismatch is a `block` violation**, not an error. The proposed price's currency must match the rule's currency; otherwise the line cannot be evaluated.
6. **Stateless server.** No session, no per-request caching beyond an in-process LRU for rule lookups (with TTL).

---

## Definition of done (MVP)

- [ ] Schema migration applied
- [ ] `ValidateBatch` gRPC handler implemented
- [ ] Rule precedence resolved in pure logic + unit-tested
- [ ] Catalog `BatchGetCosts` integration tested against real Catalog
- [ ] Integration test: batch with mixed violations and clean lines returns the right structured output
- [ ] Integration test: per-SKU request rejected at API boundary
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
- Never log proposed prices alongside customer identity (PII consideration; revisit when multi-tenant lands).
