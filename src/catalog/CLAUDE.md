# Catalog Service

The canonical pricing data store. Products, SKUs, costs, prices, channels, locations.

This service holds **the truth**. Everything else either reads from it or contributes carefully validated data to it.

Costs and prices are **versioned** (`effective_at` / `effective_until`) so historical margin math is reproducible and Governance restores are deterministic.

---

## What this owns

- The canonical tables: `products`, `skus`, `cost_records`, `price_records`, `channels`, `locations`.
- Cost and price versioning logic (effective-dated rows).
- Read APIs used by every other service that needs pricing data.
- Write APIs called only by **Import/Export** (on canonical commit) and **Proposal** (on publish).

## What this does not own

- Raw or mapped import data → **Import/Export** (lives behind the trust boundary).
- The proposal lifecycle → **Proposal**.
- Margin rules → **Margin**.

---

## Public contract

### gRPC methods

- `GetProduct(GetProductRequest) → Product`
- `BatchGetProducts(BatchGetProductsRequest) → Products`
- `GetSku(GetSkuRequest) → Sku`
- `BatchGetSkus(BatchGetSkusRequest) → Skus`
- `ListSkus(ListSkusRequest) → ListSkusResponse` — paged, filterable.
- `BatchGetCosts(BatchGetCostsRequest) → Costs` — returns the current effective cost per SKU, or as-of a timestamp.
- `BatchGetPrices(BatchGetPricesRequest) → Prices` — returns current effective prices per SKU + channel.
- `ListChannels(ListChannelsRequest) → Channels`
- `ListLocations(ListLocationsRequest) → Locations`
- **Write methods (restricted callers):**
  - `UpsertCanonical(UpsertCanonicalRequest) → UpsertResult` — called by Import/Export's canonical-commit step. Accepts a batch of validated rows; assigns/updates SKU records, inserts new cost/price records with `effective_at`. Restricted to the `import_export_svc` Postgres role's gRPC identity.
  - `ApplyPriceChanges(ApplyPriceChangesRequest) → ApplyResult` — called by Proposal on publish. Inserts new `price_record` rows with `effective_at` set per the proposal's schedule.

### REST (via Gateway)

- `GET /catalog/products/:id`
- `GET /catalog/skus/:id`
- `GET /catalog/skus` — list with filters
- `GET /catalog/channels`
- `GET /catalog/locations`
- **Writes are not exposed via REST.** Internal callers only.

### Events emitted

(Phase 5.3+) `catalog.price_updated`, `catalog.cost_updated`, `catalog.sku_added` — for Governance and downstream search indexing. Not in the locked MVP set.

### Events consumed

None at MVP.

---

## Database (schema: `catalog`)

- `product` — id, name, description, category, manufacturer, tags, created_at, updated_at.
- `sku` — id, product_id, sku_code (unique), pack_size, unit, attributes JSONB.
- `cost_record` — id, sku_id, cost, currency, effective_at, effective_until (nullable), source (`import` | `manual` | `system`), source_ref, created_at. Append-only — supersession is via a new row with `effective_until` set on the prior.
- `price_record` — id, sku_id, channel_id, price, currency, effective_at, effective_until (nullable), source, source_ref (e.g. proposal_id), created_at. Same append-only pattern as cost_record.
- `channel` — id, name (`wholesale`, `retail`, `online`, custom), code, currency.
- `location` — id, name, region, country.

Postgres role `catalog_svc` has full schema access. Other services have **read-only** access (a separate `catalog_reader` role for `margin_svc`, `proposal_svc`, etc.) on selected tables — but the recommended pattern is always to use gRPC, not direct SQL.

---

## Dependencies

- None outbound. Catalog is a leaf service for reads; only Import and Proposal write to it.

---

## Critical rules

1. **Cost and price records are append-only.** Never UPDATE a `cost_record` or `price_record`. Supersede by inserting a new row and setting `effective_until` on the previous.
2. **As-of queries are first-class.** Every cost/price read accepts an optional `as_of` timestamp. Default is `now()`.
3. **A SKU has at most one currently-effective cost** (where `effective_at <= now() < effective_until` or `effective_until IS NULL`). Enforced via partial unique index.
4. **A SKU + channel combination has at most one currently-effective price.** Same enforcement.
5. **Write callers must be authenticated as a permitted role.** Import/Export and Proposal only. Gateway never calls writes.
6. **No PII or customer-specific data.** Catalog is structural. Customer-tier pricing belongs in a separate Phase 7 service.

---

## Definition of done (MVP)

- [ ] Schema migration applied with partial unique indexes for current-effective rows
- [ ] gRPC server with all read methods
- [ ] `UpsertCanonical` and `ApplyPriceChanges` write methods
- [ ] Postgres role + GRANT setup: full for `catalog_svc`, read-only for `margin_svc`, `proposal_svc`, `governance_svc`
- [ ] Integration test: as-of cost query returns the right historical row across multiple supersessions
- [ ] Integration test: concurrent ApplyPriceChanges for the same SKU+channel doesn't produce two currently-effective rows (uses Postgres SERIALIZABLE or `INSERT ... ON CONFLICT`)
- [ ] Seed data fixtures (~1k SKUs, 3 channels, varied cost history) for Phase 1 demos
- [ ] `make lint` clean, `bazel test //src/catalog/...` green

---

## Files (target layout)

```
src/catalog/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
│   ├── 0001_products_skus.sql
│   ├── 0002_costs_prices.sql
│   ├── 0003_channels_locations.sql
│   └── 0004_grants.sql
└── src/
    ├── server.ts
    ├── handlers/
    │   ├── reads.ts
    │   └── writes.ts
    ├── domain/
    │   ├── effective-dating.ts     (compute supersession, pure)
    │   └── currency.ts
    ├── repo/
    └── tests/
```

---

## Conventions specific to this service

- Use `tstzrange` if you want range-typed queries, or `effective_at`/`effective_until` columns with a partial unique index. The chosen approach: explicit columns + partial unique index `WHERE effective_until IS NULL`. Simpler to reason about.
- All currency values stored as integer minor units (pence/cents) + ISO 4217 currency code. No floats.
- `cost_record.source` distinguishes provenance: `import` (came from a CSV via Import/Export), `manual` (admin edit), `system` (computed/derived). Useful for governance audits.
