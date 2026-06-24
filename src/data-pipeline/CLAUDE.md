# Data Pipeline Service

The bridge from messy outside-world data to canonical truth — plus the intelligence layer that learns from import metadata.

This service merges two concerns: **ingestion** (upload, profile, map, validate, commit, export) and **intelligence** (FX, rule engine, ML). Intelligence leverages import metadata — column profiles, validation patterns, mapping templates — for auto-suggestions and anomaly detection. Both are Python, owned by the data scientist.

Every import batch, row, template, and export pack is scoped by `org_id`.

---

## What this owns

### Ingestion package (`ingestion/`)

| Component | Responsibility |
|---|---|
| **ImportBatch** | One upload job. Org, file ref, status, owner, lifecycle. |
| **ImportRow** | Per-row staging. `org_id` + `raw_data JSONB` + `mapped_data JSONB` + `row_status`. |
| **ColumnProfiler** | Detects headers, types, sample values, currency hints, suggested mappings. |
| **MappingTemplate** | Reusable source→canonical column mapping. Saved per customer/channel. One-click re-import once mapped. |
| **TransformationRules** | Currency conversion, tax inclusion/exclusion, units, pack-size normalisation, discounts. |
| **ValidationEvent** | Row-level errors, warnings, and blocking issues. |
| **CanonicalCommit** | Upserts clean single-org rows into Catalog; emits `import.committed`. |
| **ExportPacks** | Per-channel CSV / XLSX builders for outbound files. |

### Intelligence package (`intelligence/`)

| Component | Responsibility |
|---|---|
| **FX Calculator** | Currency conversion using live or cached rates. |
| **Rule Engine** | Margin rule evaluation, pricing formula engine. |
| **Auto-Mapper** (future) | ML-powered column mapping suggestions based on historical profiles. |
| **Anomaly Detector** (future) | Flags unusual patterns in import data based on historical validation events. |

## What this does not own

- Anything in the canonical layer → **Catalog**.
- Margin checks on imported data — once committed, Margin reads canonical and validates independently.
- Audit → **Governance** subscribes to `import.committed`.

---

## Public contract

### gRPC methods — Ingestion

- `CreateImportBatch(CreateImportBatchRequest) → ImportBatch` — initiated by upload.
- `GetImportBatch(GetImportBatchRequest) → ImportBatch`
- `ListImportBatches(ListRequest) → ListResponse` — by owner, status, date.
- `ProfileColumns(ProfileRequest) → ProfileResult` — runs ColumnProfiler synchronously (or returns a job handle for large files).
- `ApplyMapping(ApplyMappingRequest) → MappingResult` — applies a MappingTemplate (or inline mapping) + TransformationRules to all rows; writes `mapped_data`; writes ValidationEvents.
- `GetValidationReport(GetValidationReportRequest) → ValidationReport` — error/warning summary plus per-row detail.
- `EditRow(EditRowRequest) → ImportRow` — manual fix of `mapped_data` for a single row.
- `ExcludeRow(ExcludeRowRequest) → ImportRow` — mark a row as excluded from commit.
- `CommitBatch(CommitBatchRequest) → CommitResult` — invokes CanonicalCommit; emits `import.committed`; returns row counts.
- `ListMappingTemplates(ListRequest) → Templates` — by customer, channel.
- `SaveMappingTemplate(SaveTemplateRequest) → MappingTemplate`
- `BuildExportPack(BuildExportRequest) → ExportPack` — generates a per-channel file in MinIO; returns signed URL.

### gRPC methods — Intelligence

- `ConvertCurrency(ConvertRequest) → ConvertResponse` — FX conversion with rate source and timestamp.
- `EvaluateRules(RuleRequest) → RuleResponse` — run pricing rules against a set of SKUs.

### REST (via Gateway)

- `POST /imports` — multipart upload; creates batch + stores file + streams rows.
- `GET /imports/:id` — batch detail.
- `GET /imports/:id/profile` — profile result.
- `PUT /imports/:id/mapping` — apply mapping.
- `GET /imports/:id/validation` — validation report.
- `PATCH /imports/:id/rows/:row_id` — edit a single row's mapped_data.
- `POST /imports/:id/rows/:row_id/exclude` — exclude row.
- `POST /imports/:id/commit` — finalize.
- `GET /mappings` — list templates.
- `POST /mappings` — save template.
- `POST /exports` — build a pack.
- `POST /intelligence/fx` — currency conversion.
- `POST /intelligence/rules` — rule evaluation.

### Events emitted

- `import.committed` — payload: org_id, batch_id, file_url, row_counts {ok, warned, excluded}, template_id, actor_id, at.

### Events consumed

None.

---

## Database (schema: `data_pipeline`)

- `import_batch` — id, org_id, owner_id, source_file_url, source_filename, status (`uploaded` | `profiled` | `mapped` | `validated` | `committed` | `discarded`), customer_id, channel_id, template_id (nullable), created_at, committed_at.
- `import_row` — id, org_id, batch_id, row_number, raw_data JSONB, mapped_data JSONB (nullable until mapping), row_status (`pending` | `mapped` | `validated` | `committed` | `excluded` | `errored`), excluded_reason (nullable).
- `mapping_template` — id, org_id, customer_id, channel_id, name, mappings JSONB (column → canonical_field), transformation_rules JSONB, created_at, updated_at, created_by.
- `validation_event` — id, org_id, batch_id, row_id (nullable for batch-level), severity (`error` | `warning` | `info`), code, message, field, created_at.
- `column_profile` — id, org_id, batch_id, column_name, detected_type, sample_values JSONB, suggested_mapping, confidence.
- `fx_rate_cache` — id, source_currency, target_currency, rate, fetched_at, source.

Postgres role `data_pipeline_svc` has access to schema `data_pipeline` only. **No GRANTs to `catalog` tables.** Writes to Catalog happen via the gRPC `UpsertCanonical` call, authenticated as the data pipeline service identity.

---

## Dependencies

- **Catalog** (gRPC) — `UpsertCanonical` on commit, plus `BatchGetSkus` and `BatchGetCosts` during validation for cross-checks.
- **MinIO** — raw file storage + export pack storage.
- **Bus** (Kafka) — emit `import.committed`.

---

## Critical rules

1. **`raw_data` is preserved forever.** Even after successful commit. The original file in MinIO + the parsed `raw_data` JSONB are the forensic record.
2. **Every query is scoped by `org_id`.** A batch cannot apply a mapping template or commit rows from another org.
3. **`mapped_data` is workspace.** Retained ~30 days for review then garbage-collected.
4. **Canonical writes are restricted to this service.** Catalog accepts `UpsertCanonical` only from `data_pipeline_svc` and `ApplyPriceChanges` only from `proposal_svc`.
5. **Canonical commits are single-org.** Mixed-org commit payloads are rejected.
6. **Validation runs in two passes.** First against TransformationRules, then against canonical schema constraints.
7. **Mapping templates are reusable within an org.** One-click re-import once a customer's format is mapped.
8. **Validation is non-destructive.** Errored rows are marked, not deleted.
9. **Commit is atomic per row.** Clean rows commit; errored rows stay for fix-and-recommit.
10. **Intelligence functions are pure where possible.** FX conversion and rule evaluation take inputs and return outputs; no side effects beyond caching rates.

---

## Definition of done (MVP)

### Ingestion
- [ ] Schema migration applied with `org_id` on every customer-owned table
- [ ] File upload + MinIO storage
- [ ] Raw row streaming into `import_row.raw_data` (handles CSV and XLSX)
- [ ] ColumnProfiler implementation with confidence scoring
- [ ] MappingTemplate CRUD + apply
- [ ] TransformationRules engine (FX, tax, units, pack-size, discounts) with unit tests per rule
- [ ] ValidationEvent generation and reporting
- [ ] Manual row edit + exclude
- [ ] CanonicalCommit → Catalog gRPC call → `import.committed` event emit
- [ ] Integration test: full CSV → profile → map → validate → commit path
- [ ] Integration test: re-import with saved template → 1-click commit
- [ ] Integration test: partial-fail commit leaves errored rows, succeeds for clean rows
- [ ] ExportPack builder for CSV and XLSX

### Intelligence
- [ ] FX calculator with rate caching
- [ ] Rule engine with unit tests per rule type
- [ ] gRPC endpoints for ConvertCurrency and EvaluateRules

### Shared
- [ ] `make lint` clean, `bazel test //src/data-pipeline/...` green

---

## Files (target layout)

```
src/data-pipeline/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
├── pyproject.toml
├── ingestion/
│   ├── __init__.py
│   ├── server.py              (gRPC bootstrap)
│   ├── handlers/
│   │   ├── upload.py
│   │   ├── profile.py
│   │   ├── mapping.py
│   │   ├── validation.py
│   │   ├── commit.py
│   │   └── export.py
│   ├── domain/
│   │   ├── column_profiler.py  (pure)
│   │   ├── transformations/
│   │   │   ├── fx.py
│   │   │   ├── tax.py
│   │   │   ├── units.py
│   │   │   └── pack_size.py
│   │   └── validators/
│   ├── workers/
│   │   └── mapped_data_gc.py   (30-day retention)
│   ├── clients/
│   │   └── catalog.py          (gRPC client)
│   ├── storage/
│   │   └── minio.py
│   ├── repo/
│   └── tests/
├── intelligence/
│   ├── __init__.py
│   ├── fx.py                   (FX calculator)
│   ├── rule_engine.py          (margin/pricing rule evaluation)
│   ├── auto_mapper.py          (future — ML-powered mapping suggestions)
│   └── tests/
└── tests/
    └── integration/
```

---

## Conventions specific to this service

- The trust boundary is enforced by Postgres roles. If you accidentally GRANT access to a canonical table for this service's role, that's a security audit finding — revert immediately.
- `raw_data` JSONB never carries derived fields. All derivation happens in `mapped_data`.
- TransformationRules are pure functions: `(input_value, context) → output_value | error`. No I/O in transform logic.
- Validation messages must be user-fixable: `"Row 47: column 'Cost (£)' has value 'N/A'; expected a number."` — actionable, specific, friendly.
- ColumnProfiler outputs include confidence scores. Low-confidence suggestions surfaced in yellow in the mapping UI.
- Intelligence functions should be stateless where possible. FX rates are cached but the conversion function itself is pure.
- Intelligence can read import metadata (column_profile, validation_event, mapping_template tables) to improve auto-suggestions over time.
