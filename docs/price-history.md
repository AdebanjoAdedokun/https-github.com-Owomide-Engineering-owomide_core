# Price History Semantics

Owomide should treat price history as part of the product contract, not as a reporting afterthought.

Pricing users need to answer two different time questions:

1. Business time: when was this price valid in the market?
2. System knowledge time: when did Owomide record or supersede this belief?

## Vocabulary

| Term | Meaning |
|---|---|
| `effective_at` | Start of the business-valid period. |
| `effective_until` | End of the business-valid period. Null means open-ended. |
| `recorded_at` | When Owomide learned/accepted the record. |
| `superseded_at` | When Owomide replaced this record as the current belief. Null means current belief. |
| current price | The price whose business period contains now and whose system record is not superseded. |
| price as of business date | The price valid for a requested business timestamp. |
| price as known at recorded date | The price Owomide believed was true at a requested system timestamp. |

## Why This Matters

Backdated imports are likely. A team may upload a June file on July 5 that says a price became valid on June 1. Without separate business time and recorded time, Owomide cannot explain:

- what the platform believed on June 15;
- what the corrected business truth is after July 5;
- which margin calculation used which price;
- whether a proposal was evaluated using stale or corrected cost.

## Required Query Shapes

MVP Catalog read APIs should support:

- current price:
  - `effective_at <= now`
  - `effective_until IS NULL OR effective_until > now`
  - `superseded_at IS NULL`
- price effective at a business timestamp:
  - `effective_at <= effective_as_of`
  - `effective_until IS NULL OR effective_until > effective_as_of`
  - `superseded_at IS NULL`
- price as known at a recorded timestamp:
  - `recorded_at <= recorded_as_of`
  - `superseded_at IS NULL OR superseded_at > recorded_as_of`
  - plus the business-time filter when needed.

## Append-Only Rule

Do not update economic values in place.

The only allowed economic-row update is:

- set `superseded_at` and `superseded_by_operation_id` together, once.

Business-period changes, economic values, provenance, and metadata are never updated in place. A write supersedes overlapping beliefs and inserts the new belief plus any unaffected left/right fragments.

## Preventing Overlap

Owomide needs to prevent two active prices from applying to the same dimensional key at the same business time.

Dimensional key for price records:

- `org_id`
- `sku_id`
- `channel_id`
- `location_id` nullable
- `customer_segment_id` nullable
- `currency`

The implementation uses transaction-scoped advisory locks plus generated `tstzrange` columns and partial GiST exclusion constraints. Nullable dimensions are normalized to a reserved zero UUID inside the constraint. Application logic performs deterministic interval splitting; PostgreSQL remains the final non-overlap guard.

## Examples

### Normal price change

1. Current price is NGN 10,000 from June 1.
2. Proposal publishes NGN 10,500 effective July 1.
3. Existing belief is superseded at publish time.
4. A retained left fragment ends at July 1 and a new belief starts at July 1, both recorded at publish time.

### Backdated correction

1. Owomide records NGN 10,000 effective June 1 on June 3.
2. On July 5, an import proves the correct June 1 price was NGN 9,800.
3. The old record receives `superseded_at = July 5`.
4. A corrected record is inserted with `effective_at = June 1`, `recorded_at = July 5`.
5. Historical "business truth" and "what we knew then" queries now return different answers, intentionally.

## Service Responsibilities

| Service | Responsibility |
|---|---|
| Catalog | Stores and queries price/cost history. |
| Data Pipeline | Provides source file, batch, row, and mapping provenance. |
| Proposal | Supplies approved/published change provenance. |
| Margin | Requests the correct as-of cost/price context for validation. |
| Governance | Records events and snapshots so history is explainable. |
| Analytics | Reads history for reporting; does not mutate operational records. |
