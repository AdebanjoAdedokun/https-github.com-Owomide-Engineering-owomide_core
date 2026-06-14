# Import / Export Service

The bridge from messy outside-world data to canonical truth.

This service is everything to the left of the **trust boundary**. The three-layer data model (Raw → Staging → Canonical) lives here. By the time data crosses into Catalog, it's been profiled, mapped, transformed, validated, and committed — and the rest of the system can read it with confidence. Every import batch, row, template, and export pack is scoped by `org_id`.

---

## What this owns

Eight internal components:

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

## What this does not own

- Anything in the canonical layer → **Catalog**.
- Margin checks on imported data — once committed, Margin reads canonical and validates independently.
- Audit → **Governance** subscribes to `import.committed`.

---

## Public contract

### gRPC methods (internal — usually called via gateway REST)

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

### Events emitted

- `import.committed` — payload: org_id, batch_id, file_url, row_counts {ok, warned, excluded}, template_id, actor_id, at.

### Events consumed

None.

---

## Database (schema: `import_export`)

- `import_batch` — id, org_id, owner_id, source_file_url, source_filename, status (`uploaded` | `profiled` | `mapped` | `validated` | `committed` | `discarded`), customer_id, channel_id, template_id (nullable), created_at, committed_at.
- `import_row` — id, org_id, batch_id, row_number, raw_data JSONB, mapped_data JSONB (nullable until mapping), row_status (`pending` | `mapped` | `validated` | `committed` | `excluded` | `errored`), excluded_reason (nullable).
- `mapping_template` — id, org_id, customer_id, channel_id, name, mappings JSONB (column → canonical_field), transformation_rules JSONB, created_at, updated_at, created_by.
- `validation_event` — id, org_id, batch_id, row_id (nullable for batch-level), severity (`error` | `warning` | `info`), code, message, field, created_at.
- `column_profile` — id, org_id, batch_id, column_name, detected_type, sample_values JSONB, suggested_mapping, confidence.

Postgres role `import_export_svc` has access to schema `import_export` only. **No GRANTs to `catalog` tables.** Writes to Catalog happen via the gRPC `UpsertCanonical` call, authenticated as the import service identity.

---

## Dependencies

- **Catalog** (gRPC) — `UpsertCanonical` on commit, plus `BatchGetSkus` and `BatchGetCosts` during validation for cross-checks.
- **MinIO** — raw file storage + export pack storage.
- **Bus** — emit `import.committed`.

---

## Critical rules

1. **`raw_data` is preserved forever.** Even after successful commit. The original file in MinIO + the parsed `raw_data` JSONB are the forensic record. Re-mappable if the customer's source format changes.
2. **Every import query is scoped by `org_id`.** A batch cannot apply a mapping template or commit rows from another org.
3. **`mapped_data` is workspace.** Throwaway after successful commit (retained ~30 days for review then garbage-collected via a scheduled job).
4. **Canonical writes are restricted to this service.** Catalog accepts `UpsertCanonical` only from `import_export_svc` and `ApplyPriceChanges` only from `proposal_svc`. Other identities are rejected at the Catalog handler level.
5. **Canonical commits are single-org.** Mixed-org commit payloads are rejected before Catalog is called.
6. **Validation runs in two passes.** First against `TransformationRules` (does this value convert?), then against canonical schema constraints (does this fit the target column? is the referenced SKU known?).
7. **Mapping templates are reusable within an org.** Once a customer's POS or ERP format is mapped, every future upload from that source applies the saved template automatically. The user reviews the validation report and commits.
8. **Validation is non-destructive.** A row with errors is not deleted — it's marked `errored` and presented to the user for fix or exclude.
9. **Commit is atomic per row.** A batch with 1,230 rows where 5 fail validation commits the 1,225 clean rows + warned-but-acceptable rows; the 5 stay in `errored` state and the user can fix-and-recommit them.

---

## Definition of done (MVP)

- [ ] Schema migration applied with `org_id` on every customer-owned import/export table
- [ ] File upload + MinIO storage
- [ ] Raw row streaming into `import_row.raw_data` (handles CSV and XLSX)
- [ ] ColumnProfiler implementation with confidence scoring
- [ ] MappingTemplate CRUD + apply
- [ ] TransformationRules engine (FX, tax, units, pack-size, discounts) with unit tests per rule
- [ ] ValidationEvent generation and reporting
- [ ] Manual row edit + exclude
- [ ] CanonicalCommit → Catalog gRPC call → `import.committed` event emit
- [ ] Integration test: full CSV → profile → map → validate → commit path produces Catalog rows
- [ ] Integration test: re-import same customer file with saved template → 1-click commit (no remapping)
- [ ] Integration test: partial-fail commit leaves errored rows in DB, succeeds for clean rows
- [ ] ExportPack builder for CSV and XLSX
- [ ] `make lint` clean, `bazel test //src/import-export/...` green

---

## Files (target layout)

```
src/import-export/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
└── src/
    ├── server.ts
    ├── handlers/
    │   ├── upload.ts
    │   ├── profile.ts
    │   ├── mapping.ts
    │   ├── validation.ts
    │   ├── commit.ts
    │   └── export.ts
    ├── domain/
    │   ├── column-profiler.ts        (pure)
    │   ├── transformations/
    │   │   ├── fx.ts
    │   │   ├── tax.ts
    │   │   ├── units.ts
    │   │   └── pack-size.ts
    │   └── validators/
    ├── workers/
    │   └── mapped-data-gc.ts          (30-day retention)
    ├── clients/
    │   └── catalog.ts                 (gRPC client)
    ├── storage/
    │   └── minio.ts
    ├── repo/
    └── tests/
```

---

## Conventions specific to this service

- The trust boundary is enforced by Postgres roles. There is no application-level fallback. If you accidentally GRANT access to a canonical table for this service's role, that's a security audit finding — revert immediately.
- `raw_data` JSONB never carries derived fields. It's a verbatim record of what the file contained. All derivation happens in `mapped_data`.
- TransformationRules are pure functions. Each rule takes `(input_value, context) → output_value | error`. No I/O in transform logic.
- Validation messages must be user-fixable. Error message style: `"Row 47: column 'Cost (£)' has value 'N/A'; expected a number. Did you mean to leave this row out?"` — actionable, specific, friendly.
- ColumnProfiler outputs include confidence scores. The mapping UI surfaces low-confidence suggestions in yellow so the user pays attention.
