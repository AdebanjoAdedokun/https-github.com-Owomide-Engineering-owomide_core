# Data Quality Rules

Data quality rules decide whether imported pricing data is trusted enough to enter Catalog.

The validation system should produce actionable row-level feedback, not generic failure messages.

## Severity Levels

| Severity | Meaning | Commit behavior |
|---|---|---|
| `error` | Row cannot be safely committed. | Block row commit. |
| `warning` | Row is suspicious but may be acceptable. | Commit only if policy/user allows. |
| `info` | Non-blocking note. | Commit allowed. |

## Required P0 Rules

These should exist before the first real customer import.

| Code | Severity | Rule |
|---|---|---|
| `missing_org` | error | Import batch has no authenticated `org_id`. |
| `mixed_org_payload` | error | Commit payload contains rows from more than one org. |
| `missing_sku_identity` | error | Row has no SKU code, internal ID, or matchable product identity. |
| `duplicate_sku_channel_in_batch` | error | Same SKU/channel/location/segment/effective date appears multiple times with conflicting prices. |
| `invalid_price` | error | Price is missing, negative, or not parseable as money. |
| `invalid_cost` | warning/error | Cost is missing or invalid. Severity depends on whether margin validation is required for the import. |
| `invalid_currency` | error | Currency is missing, unknown, or inconsistent with channel/country policy. |
| `unknown_channel` | error | Mapped channel does not exist and cannot be created by policy. |
| `invalid_effective_date` | error | Effective date is missing or unparseable when required. |
| `cross_org_reference` | error | Row references a SKU/channel/location/template from another org. |
| `below_cost` | error/warning | Proposed price is below known cost or margin floor. Severity depends on workflow. |

## Recommended P1 Rules

| Code | Severity | Rule |
|---|---|---|
| `unknown_product_identifier` | warning | Product name exists but identifier does not match known SKU/GTIN/internal ID. |
| `ambiguous_product_match` | warning | Source row could match multiple Catalog SKUs. |
| `large_price_delta` | warning | New price differs from current price by more than configured threshold. |
| `stale_effective_date` | warning | Effective date is unusually old for this import type. |
| `future_effective_date` | info/warning | Effective date is in the future and may require scheduling. |
| `currency_channel_mismatch` | warning/error | Currency differs from channel default. |
| `unit_pack_mismatch` | warning | Pack size or unit changed from existing SKU. |
| `missing_cost_for_margin` | warning/error | Margin check cannot run because cost is unavailable. |
| `low_confidence_mapping` | warning | Column profiler confidence is below threshold. |
| `excel_conversion_risk` | warning | Identifier looks like it may have been altered by spreadsheet formatting. |

## Validation Event Shape

Each validation event should contain:

- `id`
- `org_id`
- `batch_id`
- `row_id` nullable for batch-level events
- `severity`
- `code`
- `message`
- `field` nullable
- `raw_value` nullable
- `suggested_fix` nullable
- `created_at`

## Error Message Style

Messages should be specific and user-fixable.

Good:

```text
Row 47: column "Cost" has value "N/A"; expected a number. Enter a cost or exclude this row.
```

Bad:

```text
Invalid row.
```

## Commit Policy

MVP default:

- rows with `error` do not commit;
- rows with only `warning` can commit after user confirmation;
- rows with only `info` commit normally;
- excluded rows are preserved in Import/Export;
- commit summary includes counts:
  - `ok`
  - `warned`
  - `excluded`
  - `errored`

## Test Fixtures Needed

Create fixture files that cover:

- clean import;
- missing SKU;
- duplicate SKU/channel rows;
- invalid money values;
- currency mismatch;
- missing cost;
- below-cost row;
- future effective date;
- ambiguous product match;
- large file with mixed valid and invalid rows.
