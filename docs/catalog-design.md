# Catalog Design

## Decision

Catalog is the only owner of canonical product, SKU, cost, price, and controlled dimension data. Data Pipeline and Proposal submit typed commands through `CatalogService`; neither receives SQL grants on the `catalog` schema.

## Data Model

| Entity | Purpose | Important key |
|---|---|---|
| `product` | Optional commercial grouping above sellable units | `(org_id, id)` |
| `sku` | Sellable unit | unique active normalized SKU code per org |
| `sku_identifier` | ERP/POS/GTIN/vendor aliases | unique active `(org_id, type, namespace, normalized_value)` |
| `channel` | Route to market or price book | unique active normalized code per org |
| `location` | Store, warehouse, region, or market | unique active normalized code per org |
| `customer_segment` | Contract or customer tier | unique active normalized code per org |
| `cost_record` | Bitemporal cost belief | org, SKU, location, cost type, currency, period |
| `price_record` | Bitemporal price belief | org, SKU, channel, location, segment, currency, period |
| `write_operation` | Idempotency ledger | `(org_id, caller_service, idempotency_key)` |
| `outbox_event` | Transactional event delivery | stable UUIDv7 event ID |

`product_id` is nullable. The first reliable import can create a SKU without inventing a product hierarchy; later enrichment can attach it to a real product.

## Canonical Write Algorithm

1. Authenticate the service JWT and derive the org from metadata.
2. Hash the protobuf request and lock/create its idempotency operation.
3. Resolve each SKU by one exact identity. Create only when `new_sku` is explicit.
4. Process each source row behind a savepoint; return structured row errors for recoverable conflicts.
5. For every cost/price dimension, acquire a transaction-scoped advisory lock.
6. Supersede every overlapping current belief at one recorded timestamp.
7. Reinsert unaffected left/right fragments linked to the superseded record.
8. Insert the new belief and an outbox event in the same transaction.
9. Persist the complete response in `write_operation` before commit.

The database also enforces non-overlap with partial GiST exclusion constraints, so an application regression cannot create two current beliefs for the same instant.

## API Surface

Reads include product/SKU lookup, exact SKU resolution, cursor-paged SKU listing, and batched bitemporal cost/price lookup. Controlled references have list/save/deactivate methods. Canonical writes are `UpsertCanonical` and `ApplyPriceChanges`.

The Gateway exposes Catalog reads and org-admin reference management. Canonical writes remain internal RPCs.

## Source Provenance

Every economic record carries `source_type`, `source_ref`, `source_item_ref`, optional `actor_id`, and `write_operation_id`.

- Import: `source_ref = import_batch.id`; `source_item_ref` identifies the committed import row.
- Proposal: `source_ref = proposal.id`; `source_item_ref = proposal_line.id`.
- Migration/system writes retain an explicit stable source reference.

Catalog emits `catalog.sku_added`, `catalog.cost_updated`, and `catalog.price_updated`. Event `partition_key` is the SKU ID, preserving per-SKU order in Kafka. Consumers must deduplicate by event ID.

## Security And Operations

- Forced RLS uses transaction-local `app.org_id` on every customer-owned table.
- Tenant-safe composite foreign keys prevent cross-org object references.
- Direct delete access and direct outbox updates are revoked from the runtime role.
- Service secrets are external secrets in staging/production. Checked-in local values are development-only.
- Readiness verifies database connectivity; liveness does not depend on downstream Kafka availability.

## Integration Contracts

Data Pipeline must sign a `data_pipeline_svc` token for audience `catalog`, use `source_type = IMPORT`, send a stable chunk idempotency key, and treat row results independently. It may reference only existing controlled dimensions; Catalog does not create channels or segments implicitly during canonical commit.

Proposal must sign a `proposal_svc` token, use one stable publish idempotency key, and send approved line IDs as source-item references. Scheduling is represented by `effective_at`; Catalog can store a future belief immediately.
