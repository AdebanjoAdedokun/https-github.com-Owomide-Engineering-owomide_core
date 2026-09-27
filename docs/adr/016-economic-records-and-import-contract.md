# ADR-016: Trustworthy economic records and complete import

## Status

Proposed. This is the records and import slice of CT-02 (issue #52), drafted 27 September 2026 for
BE-02 and FE-02. It follows decisions D-04 and D-06 and conventions C-1 to C-6 in
`docs/product/mvp-2026-09/delivery/DECISIONS.md`. It pairs with ADR-015 (pricing engine), which
consumes the resolved records defined here. It needs lead engineer review before any runtime code
changes.

## Context

The Catalog schema (`src/catalog/migrations/0002_catalog_foundation.up.sql`) is a strong base:

- **Overlaps are impossible.** Price and cost records have `EXCLUDE USING gist` constraints, so two
  active records can never overlap for the same exact context.
- **History is kept.** Records are immutable, apart from supersession.
- **Every record says where it came from:** `source_type`, `source_ref`, `source_item_ref`,
  `actor_id`, `write_operation_id` and `derived_from_record_id`.
- **Amounts are integer minor units.**

The gaps against the PRD and decisions D-04 and D-06:

| # | Gap | Where | Requirement |
|---|---|---|---|
| 1 | **The VAT flag is dropped.** The import maps and parses `price_record.tax_inclusive` (`mapping.py:33`, `transformations.py:126`), but `catalog.price_record` has no tax column and the Catalog proto has no tax field. Every VAT-inclusive shelf price loses its basis on commit, and margins would be computed on VAT-inclusive prices. | Catalog schema and proto | DATA-022 (never cut from Release 1) |
| 2 | **No tax rate anywhere,** and no organisation default tax basis. | Catalog, organisation settings | DATA-022 |
| 3 | **Cost records have no unit,** so compatibility with the price's unit cannot be checked. | `catalog.cost_record` | DATA-004 |
| 4 | **Category exists** (`catalog.product.category`) **but has no import target** in `CANONICAL_TARGETS`. | `mapping.py:16-44` | DATA-007, DATA-014 |
| 5 | **Every price needs a channel** (`price_record.channel_id NOT NULL`). Decision D-04 wants one organisation-wide price in Release 1. | `catalog.price_record` | DATA-003 |
| 6 | **No "resolve" operation.** Nothing returns "the Current Price for this entity, context and time" or "the Applicable Unit Cost for this configured basis", or a reason why neither can be determined. | Catalog service | DATA-003, DATA-004 |
| 7 | **Scope building reads one page of 500 SKUs,** and the write engine takes at most 500 rows per call. | `proposal/src/service.ts:830`, `catalog/src/write-engine.ts:50` | DATA-014, BUILD-004 |
| 8 | **Recording an implementation must end-date the previous price in the same operation.** The exclusion constraint otherwise refuses the new record, or the old one stays current. | Catalog write path | EXEC-006, DATA-005, D-06 |

## Decision

### 1. Tax basis is stored on every price record

Add to `catalog.price_record`, additively:

| Column | Type | Meaning |
|---|---|---|
| `tax_inclusive` | boolean, NOT NULL | Backfill `false` for existing rows, recorded as a `migration` source |
| `tax_rate_bp` | integer, nullable | Basis points, so 7.5% = 750. Required when `tax_inclusive` is true for any calculation to proceed. The row may still be stored without it. |
| `tax_basis_source` | text: `explicit` or `organisation_default` | Keeps an applied default visible |

Organisation settings gain `default_tax_inclusive` and `default_tax_rate_bp`, set at onboarding (J3).
A later change to the default never rewrites existing records.

### 2. Cost records carry a unit, and the organisation names its cost basis

- Add `unit` (text, NOT NULL, backfill `each`) to `catalog.cost_record`.
- Organisation settings gain `calculation_cost_basis`, the `cost_type` used for calculations. D-04
  sets it to `landed`.
- Cost records of other bases are stored and shown as context. They are never used in calculations.

### 3. An organisation-wide price uses a default channel

Rather than making `channel_id` nullable, each organisation gets one system channel, `default`, at
creation. Release 1 prices go there. Release 2 location and channel prices use real channels. This
keeps the exclusion constraint and every existing query intact.

### 4. Import targets

Add these to `CANONICAL_TARGETS`, with validation:

- `product.category`
- `price_record.tax_rate_pct`, via a `percent_to_basis_points` transformation
- `cost_record.unit`, via `unit_normalize`

Send `tax_inclusive`, `tax_rate_bp` and `tax_basis_source` through the Catalog write proto.

New row outcomes, with reason codes (matching `core-handoff/import-template.md`):

| Reason code | When |
|---|---|
| `tax_basis_missing` | No flag and no organisation default |
| `tax_rate_missing_for_inclusive_price` | A warning, not a rejection |
| `cost_unit_incompatible` | Context only |
| `duplicate_in_file` | Both rows held for a decision |
| `overlapping_price_record` | Rejected by the exclusion constraint, reported per row. Never a whole-batch failure. |

### 5. Catalog answers two questions, with a reason when it cannot

```proto
rpc ResolveCurrentPrices(ResolveCurrentPricesRequest) returns (ResolveCurrentPricesResponse);
rpc ResolveApplicableCosts(ResolveApplicableCostsRequest) returns (ResolveApplicableCostsResponse);

message PriceContext { string sku_id = 1; string channel_id = 2; optional string location_id = 3;
                       optional string customer_segment_id = 4; string currency = 5; }

message ResolvedPrice {
  PriceContext context = 1;
  oneof result {
    PriceRecord record = 2;                       // includes tax basis and the record id
    owomide.common.v1.Unavailable unavailable = 3; // NO_APPLICABLE_PRICE_RECORD
  }
}
message ResolvedCost {
  PriceContext context = 1;
  oneof result {
    CostRecord record = 2;                         // exact-context record preferred to a location-less one (C-6)
    owomide.common.v1.Unavailable unavailable = 3; // NO_APPLICABLE_COST_RECORD, COST_BASIS_REQUIRES_SELECTION,
                                                   // COST_CURRENCY_INCOMPATIBLE, COST_UNIT_INCOMPATIBLE
  }
}
```

- **Exact context only.** A price for another channel or location is never borrowed.
- **At a stated time.** A future-effective record is not current before its start.
- **Both operations are paged and batched.** A caller can resolve 5,000 or more contexts through
  pages, with a count of every member, and nothing is dropped.

### 6. Scope is complete, not capped

Scope building pages through Catalog until the source set is exhausted. It returns every member
classified as one of:

- resolved
- no Current Price
- no applicable cost
- excluded (with a reason)

The 500-row limit stays a batch size, not a population limit.

### 7. Implementation writes one operation

Recording an implemented line writes both changes in one `write_operation`:

- the new price record, with `source_type = 'proposal'`, `source_ref` = the Proposal version,
  `derived_from_record_id` = the previous record, and the implemented value
- the previous record's `effective_until`, set to the actual effective time

A failed or partial operation reports per line, as BE-07 requires.

## Verification

Each item is checked by an existing fixture or test:

| Check | Fixture or test |
|---|---|
| Choosing the right records | Calculation test pack cases CALC-G01 to G10, as conformance tests for the resolve operations |
| A 5,000-SKU import with every row accounted for | `core-handoff/test-catalogue`: `products.csv`, `prices.csv` and `costs.csv` |
| Supplier update outcomes: 120 ready, 8 rejected with reasons, 2 duplicates held | `expected/supplier_update_import.json` |
| Onboarding validation, every problem named | `onboarding_messy_*.csv` |
| Exposure after the update: 40 breaches, 25 Unable to Evaluate | `expected/exposure_after_update.json`, which also exercises the ADR-015 engine |
| Retrying a commit creates no duplicates, and row outcomes reconcile | BDD 11 |

## Migration (additive)

1. Add the columns with backfills (`tax_inclusive = false` with source `migration`; `unit = 'each'`).
   Add the default channel per organisation. Add the organisation settings.
2. Extend the Catalog write proto and the data-pipeline commit to carry the tax and unit fields.
3. Add the resolve operations, and move Proposal scope building onto them.
4. **Existing staging rows are left as they are.** The backfill marks them `tax_inclusive = false`
   from `migration`, so they are distinguishable and can be corrected by re-import. No production
   data exists yet.

## Open questions for the lead engineer

1. Is `tax_rate_bp` enough as basis points, or do any pilot markets need finer rates?
2. Should the organisation settings live in Catalog, or in a new organisation settings table owned by
   RBAC or Governance?
3. Should resolution run inside Catalog, or as a read model the engine queries directly?
