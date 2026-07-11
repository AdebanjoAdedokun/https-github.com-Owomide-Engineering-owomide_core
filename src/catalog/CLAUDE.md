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
