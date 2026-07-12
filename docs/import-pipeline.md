# Import Pipeline

Owomide's import pipeline turns messy outside-world pricing files into trusted Catalog records.

The import service owns everything before the trust boundary:

```text
original file -> raw rows -> profiled columns -> mapped rows -> validation events -> canonical commit
```

Catalog should never read raw or mapped import data directly.

## Supported Source Shapes

MVP:

- CSV
- XLSX

Designed for later:

- JSON
- XML
- SFTP feed
- ERP/POS/PIM connector
- ecommerce platform connector
- API submission

Research from Price2Spy and PriceShape supports CSV/JSON/XML/feed-based integration patterns. Pricefx and Jumpseller support export/edit/import workflows with validation.

## Import Lifecycle

| Step | Description | Output |
|---|---|---|
| Upload | Store original file in MinIO and create `import_batch`. | `source_file_url`, batch status `uploaded` |
| Parse | Stream rows into `import_row.raw_data`. | raw row records |
| Profile | Detect headers, types, samples, currency hints, and likely canonical fields. | `column_profile` records |
| Map | Apply saved or inline mapping template. | `mapped_data` |
| Transform | Normalize currency, tax, unit, pack size, decimals, dates. | transformed `mapped_data` |
| Validate | Create row-level errors/warnings/info. | `validation_event` records |
| Review | User fixes, excludes, or accepts rows. | row statuses updated |
| Commit | Upsert clean rows to Catalog through gRPC. | Catalog records and `import.committed` |

## Mapping Template

Mapping templates are dynamic configuration for source-specific files. They should not weaken the canonical model.

Example structure:

```json
{
  "source_system": "customer_csv",
  "fields": {
    "Item Code": "sku.sku_code",
    "Description": "product.name",
    "Selling Price": "price_record.price_minor",
    "Cost": "cost_record.cost_minor",
    "Currency": "price_record.currency",
    "Price List": "channel.code",
    "Effective Date": "price_record.effective_at"
  },
  "transforms": [
    {"field": "Selling Price", "type": "decimal_to_minor_units"},
    {"field": "Effective Date", "type": "date_parse", "format": "DD/MM/YYYY"}
  ]
}
```

The API stores the `fields` object as `mappings_json` and the `transforms` array as
`transformation_rules_json`; source context is stored in typed template columns. Gateway callers
use native JSON:

```json
{
  "name": "Customer ERP prices",
  "sourceSystem": "customer_csv",
  "mappings": {
    "Item Code": "sku.sku_code",
    "Selling Price": "price_record.price_minor"
  },
  "transformationRules": [
    {"field": "Selling Price", "type": "decimal_to_minor_units", "scale": 2}
  ]
}
```

Each source column maps to one supported canonical staging leaf, and a canonical leaf may appear
only once. Applying the example produces nested staging data while preserving source values:

```json
{
  "sku": {"sku_code": "A-100"},
  "price_record": {"price_minor": "125.50"}
}
```

Mapping first preserves the raw price as a string. The automatically queued validation operation
then executes `decimal_to_minor_units`; no float is treated as canonical money. Supported
transformation rule names are `money_parse`, `decimal_to_minor_units`, `date_parse`, `tax_flag`,
`unit_normalize`, `pack_size_normalize`, and `currency_convert_explicit`. Currency conversion
requires an explicit positive rate and source/target currency; live or cached FX is deferred.

Mapping application is asynchronous. `ApplyMapping` snapshots mappings, transformation rules, the
template ID, and template update timestamp into `import_operation.request_payload`. Editing a
template after queueing therefore cannot change a retry. Rows are processed in bounded pages,
`raw_data` remains immutable, and the batch becomes `mapped` only after all row updates succeed.
Mapping completion atomically queues validation. Validation rebuilds row findings on every retry,
resolves controlled references from Catalog in bounded requests, and advances rows to `validated`
or `errored`. Editing or excluding a row clears stale findings and queues batch-wide revalidation
because duplicate price detection spans rows.

## Canonical Commit Rules

Commit is the point where data crosses into Catalog.

Rules:

- commit payload must contain exactly one `org_id`;
- only rows without blocking validation errors are committed;
- warned rows commit only when the caller sets `confirm_warnings` explicitly;
- excluded rows remain in Data Pipeline and do not touch Catalog;
- Catalog writes happen only through `UpsertCanonical`;
- import emits `import.committed` with row counts and provenance;
- original file and raw rows remain available for forensic review.

Commit is itself asynchronous. Queueing freezes eligible row IDs and their order in `commit_item`
and moves the batch to `committing`, after which rows cannot be edited or excluded. Workers send
at most 500 rows per Catalog request using `import:{batch_id}:chunk:{chunk_index}` as the stable
idempotency key. Catalog rejections become actionable validation events and `errored` rows; other
rows in the batch remain committed.

Batch completion, the durable commit result, and the `import.committed` outbox record share one
PostgreSQL transaction. The outbox publisher is at-least-once: it uses `batch_id` as the Kafka key
and a deterministic event ID for consumer deduplication.

## Async Execution

Import processing is asynchronous from day one. The upload endpoint returns `202` with a batch ID and operation ID after the source file is durable and the initial operation is queued. Workers claim operations with database row locking, record progress, and make retries visible through operation state.

This avoids changing the public contract when customer files become large. Implementations must still:

- stream uploads and parsers rather than loading entire files into memory;
- enforce explicit file and row limits at the edge;
- make every operation restart-safe and idempotent;
- expose progress and actionable failure details.

F2.2 defaults are configurable rather than hard-coded product policy:

- maximum file size: 50 MiB;
- maximum data rows: 250,000;
- maximum columns: 500;
- database insert chunk: 1,000 rows.

CSV input is UTF-8 and uses a header row. XLSX reads the first visible worksheet in read-only
mode and preserves formula expressions in staged raw data. Original files remain the forensic
source of truth.

Column profiling runs in the same restart-safe `parse_profile` operation as parsing. It keeps
bounded distinct samples, detects `empty`, `boolean`, `integer`, `decimal`, `date`, `datetime`,
`string`, or `mixed` values, and records currency/date hints plus conservative canonical mapping
suggestions. Profiles retain source column order through `ordinal_position`. Ambiguous date values
may be detected as dates without guessing a format, and ambiguous header matches receive no
suggestion. The worker publishes every profile and advances the batch to `profiled` atomically.

## Locked Decisions

- Imports commit validated rows directly through Catalog `UpsertCanonical`.
- Rows with errors cannot commit.
- Rows with warnings require explicit `confirm_warnings` confirmation.
- Original files and `raw_data` are immutable forensic records.
- `org_id` and `user_id` come from authenticated Gateway metadata, never request bodies.
- Kafka is the event transport from day one.

## Required User Experience

The UI should expose the import pipeline as a workflow, not a single upload modal:

1. Upload file and select source context.
2. Review column profiling and mapping suggestions.
3. Confirm or edit mapping.
4. Review validation report.
5. Fix or exclude bad rows.
6. Commit clean rows.
7. See commit summary and resulting Catalog changes.

## Remaining Engineering Decisions

- whether customer tiers should override the configurable upload and row limits;
- when the 30-day `mapped_data` cleanup job should run;
- whether high-impact imports should automatically create a Proposal before Catalog commit.
