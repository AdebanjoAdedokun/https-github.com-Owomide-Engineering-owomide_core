# FX Intelligence

F7.3 adds deterministic historical currency conversion to the Data Pipeline. It does not
couple Owomide to an external market-data vendor. Organization administrators or a future
provider adapter record immutable rate snapshots, and all lookups identify the exact snapshot
used.

## Rate semantics

- A snapshot states that `1 base_currency = rate quote_currency` for every entry.
- Snapshots are tenant-scoped and protected by PostgreSQL RLS.
- `effective_at` is market/business time; `recorded_at` is when Owomide learned the rate.
- A lookup selects the newest snapshot with `effective_at <= requested effective_at` and
  `recorded_at <= requested recorded_as_of`.
- Rates older than `DATA_PIPELINE_FX_MAX_RATE_AGE_SECONDS` are rejected. The default is seven
  days so weekends can resolve without accepting indefinitely stale data.
- Cross rates are calculated inside one snapshot. For an EUR snapshot containing USD and NGN,
  `USD/NGN = NGN rate / USD rate`.
- Rate strings use plain decimal notation with at most 18 decimal places. Binary floating point
  is never used.
- API timestamps support up to microsecond precision, matching PostgreSQL storage. Higher
  precision is rejected instead of being silently truncated.

## Recording snapshots

`RecordFxRateSnapshot` and `POST /intelligence/fx/rate-snapshots` require the organization
`admin` role. `idempotency_key` is scoped to the organization. Reusing it with the same
canonical payload returns the original snapshot; reusing it with different data is rejected.

Snapshots and entries cannot be updated or deleted by `data_pipeline_svc`. Corrections are new
snapshots, allowing `recorded_as_of` queries to reproduce what the platform knew previously.

## Conversion

`GetFxRate` resolves rate provenance. `ConvertCurrency` accepts signed 64-bit minor units and
returns:

- source and target minor-unit amounts;
- ISO 4217 source and target minor-unit scales;
- the exact target major-unit decimal before rounding;
- half-even rounding mode;
- source, snapshot ID, effective timestamp, and recorded timestamp.

Currencies without an ISO 4217 minor unit, such as precious-metal units, can be quoted but
cannot be converted through the minor-unit API.

## Import transformation

The `currency_convert` transformation resolves a historical rate during validation. Its
`effective_at_field` must map to the amount record's own `effective_at` field. The validation
operation freezes `fx_recorded_as_of`, so worker retries and row revalidation cannot silently
use rates recorded later.

```json
[
  {
    "field": "Price",
    "type": "currency_convert",
    "to_currency": "NGN",
    "rate_source": "treasury",
    "effective_at_field": "Price Effective At"
  },
  {
    "field": "Price",
    "type": "decimal_to_minor_units",
    "scale": 2,
    "rounding": "half_even"
  }
]
```

Currency conversion must precede `decimal_to_minor_units`. Rate lookups are cached per
validation operation and unique currency/source/effective-time combination.

## Provider boundary

Provider ingestion remains an adapter concern. An adapter must normalize vendor data into the
same immutable snapshot contract and use stable idempotency keys. Vendor credentials, polling,
licensing rules, and outage policy must not enter the calculator domain.
