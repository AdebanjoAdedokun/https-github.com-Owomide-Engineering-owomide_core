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

## Canonical Commit Rules

Commit is the point where data crosses into Catalog.

Rules:

- commit payload must contain exactly one `org_id`;
- only rows without blocking validation errors are committed;
- warned rows may commit if the validation policy allows it;
- excluded rows remain in Data Pipeline and do not touch Catalog;
- Catalog writes happen only through `UpsertCanonical`;
- import emits `import.committed` with row counts and provenance;
- original file and raw rows remain available for forensic review.

## Batch Size

Jumpseller warns that large CSV validation can take time and recommends splitting large files. Owomide should support large files eventually, but MVP can set clear limits.

MVP recommendation:

- validate synchronously up to a small threshold;
- switch to background job for larger files;
- show progress and partial validation summary;
- keep import restart-safe.

## Required User Experience

The UI should expose the import pipeline as a workflow, not a single upload modal:

1. Upload file and select source context.
2. Review column profiling and mapping suggestions.
3. Confirm or edit mapping.
4. Review validation report.
5. Fix or exclude bad rows.
6. Commit clean rows.
7. See commit summary and resulting Catalog changes.

## Open Engineering Decisions

- exact row threshold for background validation;
- CSV parser library and XLSX parser library;
- whether warnings require explicit user confirmation;
- how long to retain `mapped_data`;
- whether high-impact imports should automatically create a Proposal before Catalog commit.
