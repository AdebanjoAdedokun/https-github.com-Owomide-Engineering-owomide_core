# Catalog Service

The canonical pricing data store. Products, SKUs, costs, prices, channels, locations.

This service holds **the truth**. Everything else either reads from it or contributes carefully validated data to it.

All customer-owned Catalog data is scoped by `org_id`. Costs and prices are **versioned** by business time (`effective_at` / `effective_until`) and system knowledge time (`recorded_at` / `superseded_at`) so historical margin math, backdated imports, and Governance restores are deterministic.

---

## What this owns

- The canonical tables: `products`, `skus`, `cost_records`, `price_records`, `channels`, `locations`.
- Org-scoped uniqueness and access rules for customer-owned pricing data.
- Cost and price versioning logic across business time and system knowledge time.
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
- `BatchGetCosts(BatchGetCostsRequest) → Costs` — returns the current effective cost per SKU, or as-of a business timestamp and optional recorded-as-of timestamp.
- `BatchGetPrices(BatchGetPricesRequest) → Prices` — returns current effective prices per SKU + channel, or as-of a business timestamp and optional recorded-as-of timestamp.
- `ListChannels(ListChannelsRequest) → Channels`
- `ListLocations(ListLocationsRequest) → Locations`
- **Write methods (restricted callers):**
  - `UpsertCanonical(UpsertCanonicalRequest) → UpsertResult` — called by Import/Export's canonical-commit step. Accepts a single-org batch of validated rows; assigns/updates SKU records, inserts new cost/price records with `effective_at` and `recorded_at`. Restricted to the `import_export_svc` Postgres role's gRPC identity.
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

- `product` — id, org_id, name, description, category, manufacturer, tags, created_at, updated_at.
- `sku` — id, org_id, product_id, sku_code, pack_size, unit, attributes JSONB.
- `cost_record` — id, org_id, sku_id, cost, currency, effective_at, effective_until (nullable), recorded_at, superseded_at (nullable), source (`import` | `manual` | `system`), source_ref, created_at.
- `price_record` — id, org_id, sku_id, channel_id, price, currency, effective_at, effective_until (nullable), recorded_at, superseded_at (nullable), source, source_ref (e.g. proposal_id), created_at.
- `channel` — id, org_id, name (`wholesale`, `retail`, `online`, custom), code, currency.
- `location` — id, org_id, name, region, country.

Postgres role `catalog_svc` has full schema access. Other services read Catalog through gRPC. Direct SQL access from other service roles is not part of the MVP contract.

---

## Dependencies

- None outbound. Catalog is a leaf service for reads; only Import and Proposal write to it.

---

## Critical rules

1. **Every customer-owned row has `org_id`.** Every handler derives it from authenticated request context and every query filters by it.
2. **Cost and price records are versioned, never destructively overwritten.** A correction inserts a new record and closes or supersedes the previous one; economic values are not updated in place.
3. **As-of queries are first-class.** Every cost/price read accepts an optional `effective_as_of` timestamp and optional `recorded_as_of` timestamp. Defaults are `now()`.
4. **A SKU has at most one currently-effective cost per org** for a given business time and recorded-as-of view. Enforced by indexes and transaction logic.
5. **A SKU + channel combination has at most one currently-effective price per org.** Same enforcement.
6. **Write callers must be authenticated as a permitted role.** Import/Export and Proposal only. Gateway never calls writes.
7. **No individual end-customer PII.** Catalog is structural and pricing-focused. Customer-tier pricing can be modeled by org-scoped segment/channel identifiers without storing personal data.

---

## Definition of done (MVP)

- [ ] Schema migration applied with `org_id` on every customer-owned table and partial unique indexes for current-effective rows
- [ ] gRPC server with all read methods
- [ ] `UpsertCanonical` and `ApplyPriceChanges` write methods
- [ ] Postgres role setup: full for `catalog_svc`; other services reach Catalog via gRPC
- [ ] Integration test: as-of cost query returns the right historical row across multiple supersessions and recorded-as-of views
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

- Use `tstzrange` if you want range-typed queries, or `effective_at`/`effective_until` columns with a partial unique index. The chosen approach: explicit columns + partial unique index `WHERE effective_until IS NULL AND superseded_at IS NULL`. Simpler to reason about.
- `org_id` is the first column in customer-owned uniqueness constraints and high-cardinality lookup indexes.
- All currency values stored as integer minor units (pence/cents) + ISO 4217 currency code. No floats.
- `cost_record.source` distinguishes provenance: `import` (came from a CSV via Import/Export), `manual` (admin edit), `system` (computed/derived). Useful for governance audits.
