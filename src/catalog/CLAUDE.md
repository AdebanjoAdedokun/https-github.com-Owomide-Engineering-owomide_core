# Catalog Service

Catalog owns Owomide's org-scoped canonical products, SKU identities, controlled pricing dimensions, and bitemporal cost/price history. Other services use its Connect/gRPC contract; they never write Catalog tables directly.

## Ownership

- `product`, `sku`, and namespaced `sku_identifier`
- controlled `channel`, `location`, and `customer_segment` references
- immutable `cost_record` and `price_record` beliefs
- write idempotency and transactional Catalog events

Raw imports, mappings, and validation belong to Data Pipeline. Proposal lifecycle and approvals belong to Proposal. MinIO is not a Catalog database or shared volume.

## Write Boundaries

- `data_pipeline_svc` calls `UpsertCanonical` after validation.
- `proposal_svc` calls `ApplyPriceChanges` after publication is authorized.
- `gateway_svc` may administer controlled references for an authenticated org admin.
- Gateway and downstream readers cannot call canonical write methods.

Caller identity is a signed, short-lived service JWT with audience `catalog`. `org_id`, `user_id`, and roles come from authenticated metadata, never a request body.

## Identity Rules

- SKU matching is exact and org-scoped: UUID, normalized SKU code, or `(type, namespace, normalized value)` identifier.
- Catalog performs no fuzzy matching and does not silently merge ambiguous records.
- New SKU creation requires an explicit `new_sku`; an identifier used to create it must be included in that SKU's identifiers.
- Product association is optional because imports can contain sellable units before a clean product hierarchy exists.
- Identifiers are rows, not nullable `gtin`/`ean`/`upc` columns, so new identifier systems do not require schema changes.

## Temporal Rules

- Money is signed 64-bit integer minor units plus an uppercase ISO-style three-letter currency. No floats.
- Business validity is `[effective_at, effective_until)`.
- Knowledge validity is `[recorded_at, superseded_at)`.
- Economic rows are immutable except for a one-time supersession marker.
- A write supersedes overlapping current beliefs, preserves unaffected left/right fragments, and inserts the new belief.
- PostgreSQL GiST exclusion constraints prevent overlapping current beliefs for the same org and dimensional key.
- Reads accept both `effective_as_of` and `recorded_as_of`; both default to now.

## Reliability Rules

- Every public database operation sets transaction-local `app.org_id`; forced RLS is the final tenant boundary.
- Composite foreign keys include `org_id`, preventing cross-org references.
- Canonical writes require an idempotency key. Reusing it with the same payload replays the stored response; a different payload is rejected.
- A batch is atomic at the operation level but uses a savepoint per source row, so bad rows cannot roll back valid rows.
- Catalog events are written to `outbox_event` in the same transaction. The worker provides at-least-once delivery; stable event IDs provide logical deduplication to consumers.
- Never claim transport-level exactly-once delivery.

## Tax basis, cost units and resolution (migration 0003)

ADR-016; decision D-04 (VAT-inclusive at 7.5%, landed cost); PRD DATA-003, DATA-004, DATA-022.

- `price_record.tax_inclusive`, `tax_rate_bp` (basis points, 7.5% = 750) and `tax_basis_source`
  (`explicit` | `organisation_default` | `unspecified`). A record with no stated basis is
  `unspecified` with `tax_inclusive` NULL. It is never assumed to be tax-exclusive. (This replaces
  ADR-016's "backfill `false`" so unknown and exclusive stay distinguishable.)
- `cost_record.unit` (lower-case code, default `each`).
- `pricing_settings`, one row per organisation: default tax basis and rate, the
  `calculation_cost_basis` (D-04: `landed`) and the `default_channel_id` used for organisation-wide
  prices. Written only through `catalog.configure_pricing_settings(...)`, which also creates the
  `default` channel.
- A new price record without a stated basis takes the organisation default when it is written
  (trigger `price_record_apply_default_tax_basis`). Changing the default never rewrites stored
  records. Fragments copy their parent's basis, and the cost unit, exactly.
- Re-importing an `unspecified` price after a default exists replaces it (`UPDATED`), so early
  imports can be corrected without new files.
- `catalog.resolve_current_prices(contexts jsonb, at timestamptz)` and
  `catalog.resolve_applicable_costs(contexts jsonb, at timestamptz)` return one row per context in
  input order, with an `unavailable_reason` instead of a guess:
  `NO_APPLICABLE_PRICE_RECORD`, `TAX_BASIS_MISSING`, `TAX_RATE_MISSING_FOR_INCLUSIVE_PRICE`,
  `NO_APPLICABLE_COST_RECORD`, `COST_BASIS_REQUIRES_SELECTION`, `COST_CURRENCY_INCOMPATIBLE`,
  `COST_UNIT_INCOMPATIBLE`. Prices resolve for the exact context only. Costs use only the configured
  basis and prefer the exact location to a location-less record (convention C-6).

Not yet exposed over Connect: the write proto has no tax fields and there are no resolve RPCs.
Both need `make proto`. Until then imports rely on the organisation default.

## Runtime

- Connect/gRPC server: `50052`
- health/readiness HTTP server: `8080`
- outbox worker: separate process from the same image
- schema: `catalog`; runtime role: `catalog_svc`
- event provider: Kafka through `src/lib/bus`

## Verification

```bash
bazel test //src/catalog:unit_tests
bazel test //src/catalog:integration_tests --test_output=errors
make manifests-validate
```

The integration target requires Docker and validates PostgreSQL 16 migrations, RLS, bitemporal reads and splits, concurrent writes, idempotency, partial-row failure, Proposal writes, outbox leasing, rollback, and deterministic fixtures.

The detailed contract and decision record is in `docs/catalog-design.md`.
