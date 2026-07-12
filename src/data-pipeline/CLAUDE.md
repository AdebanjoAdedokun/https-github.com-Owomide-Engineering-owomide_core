# Data Pipeline Service

The Data Pipeline accepts untrusted customer pricing files and turns reviewed rows into typed Catalog commands. It owns import staging, profiling, mapping, transformation, validation, canonical commit, and later export/intelligence modules.

## Boundaries

- Owns the `data_pipeline` PostgreSQL schema.
- Stores original source files and later export packs in object storage.
- Has no SQL grants on `catalog`; canonical writes use authenticated Catalog RPCs.
- Receives tenant and actor context only from signed Gateway metadata.
- Uses Kafka through `src/lib/bus`; Redis Streams are not part of this design.
- Export and intelligence remain Phase 7 work.

## Lifecycle

```text
upload -> parse/profile -> map -> validate -> review -> commit
```

Batch states:

```text
uploaded -> parsing -> profiled -> mapped -> validated -> committing -> committed
                                                               \-> failed
```

Every processing step has an `import_operation` record. Public requests return operation state rather than changing between synchronous and asynchronous behavior based on file size.

## F2.1 Scope

F2.1 provides:

- versioned `DataPipelineService` protobuf contract;
- Python gRPC server and worker entrypoints;
- signed internal service authentication;
- liveness and database-backed readiness endpoints;
- typed environment configuration;
- six tenant-scoped staging tables with forced RLS;
- Bazel, Python packaging, and production container targets.

Handlers outside their owning phase intentionally return `UNIMPLEMENTED`. F2.3 adds profiling, F2.4 mappings, F2.5 validation, and F2.6 Catalog commit/events.

## F2.2 Scope

F2.2 provides:

- Gateway multipart streaming into the client-streaming upload RPC;
- durable originals in MinIO under `imports/{org_id}/{batch_id}/{filename}`;
- SHA-256 provenance plus atomic `import_batch` and `import_operation` creation;
- tenant-scoped batch, list, and operation reads;
- cross-tenant worker leasing through one narrow `SECURITY DEFINER` claim function;
- restart-safe CSV and XLSX parsing with chunked, conflict-safe raw-row inserts;
- configurable 50 MiB file, 250,000-row, and 500-column defaults;
- server and worker Kubernetes deployments.

CSV parsing is streaming. XLSX uses `openpyxl` read-only mode and a disk-backed spool because
the XLSX ZIP container requires seeking.

Multipart metadata fields (`sourceSystem`, `channelId`, `customerSegmentId`) must precede the
file part. They may instead be supplied as query parameters, which avoids ordering concerns.

## F2.3 Scope

F2.3 provides:

- bounded-memory profiling during the existing `parse_profile` worker operation;
- deterministic type detection, distinct samples, currency/date hints, and canonical suggestions;
- source-order preservation with `column_profile.ordinal_position`;
- atomic profile publication, operation completion, and transition to batch status `profiled`;
- tenant-scoped `GetColumnProfile` and `GET /imports/:id/profile` reads;
- migration recovery for F2.2 batches that completed parsing before profiling existed.

Ambiguous date formats are never guessed. Ambiguous header aliases produce no mapping suggestion.
Header-only files fail with an actionable error because there is no data to profile.

## F2.4-F2.5 Scope

F2.4 provides:

- org-scoped mapping template create/update/list with source, channel, and segment filters;
- strict source-to-canonical mapping and transformation-rule configuration validation;
- `ApplyMapping` and `PUT /imports/:id/mapping` for saved or inline mappings;
- restart-safe `apply_mapping` operations handled by the existing worker;
- immutable operation snapshots so later template edits do not change queued or retried work;
- bounded row paging into nested `mapped_data` without modifying `raw_data`;
- one active pipeline stage per batch to prevent remap/validation races;
- atomic completion into batch status `mapped` and a queued validation operation;
- exact money/date/unit/pack/tax transformations without binary floating point;
- Catalog-backed channel, location, segment, SKU ID, and known-cost validation;
- actionable row findings, batch duplicate detection, and derived row counts;
- validation report pagination plus row edit/exclusion with automatic revalidation.

Reapplying a mapping replaces `mapped_data`, preserves excluded-row state, invalidates prior
validation events, and queues a new validation snapshot. Validation attempts clear and rebuild
their own findings, making lease recovery and retries idempotent.

## F2.6 Scope

F2.6 provides:

- asynchronous `CommitBatch` and `POST /imports/:id/commit` entrypoints;
- an immutable `commit_item` snapshot that fixes row membership and 500-row chunk boundaries;
- authenticated Catalog `UpsertCanonical` calls with stable per-chunk idempotency keys;
- row-level Catalog rejection handling without rolling back accepted rows;
- explicit warning confirmation and post-queue edit/exclusion guards;
- durable commit results on `import_operation`, including every Catalog operation ID;
- a transactional `outbox_event` written with batch completion;
- at-least-once `import.committed` publication through the shared Kafka bus.

If a worker stops after Catalog accepts a chunk but before Data Pipeline records the response, the
retry sends the same rows with the same idempotency key and receives Catalog's stored response.
Logical event duplicates use one deterministic event ID so consumers can deduplicate safely.

## Public RPCs

- `UploadImportFile` (client streaming)
- `GetImportBatch`, `ListImportBatches`, `GetImportOperation`
- `GetColumnProfile`
- `ApplyMapping`
- `GetValidationReport`
- `EditRow`, `ExcludeRow`
- `CommitBatch`
- `ListMappingTemplates`, `SaveMappingTemplate`

Gateway REST routes map to these RPCs. Requests never carry editable `org_id` or `user_id` fields.

## Database

Schema: `data_pipeline`; role: `data_pipeline_svc`.

| Table | Purpose |
|---|---|
| `import_batch` | Source file metadata, checksum, context, lifecycle |
| `import_row` | Immutable `raw_data` and replaceable `mapped_data` workspace |
| `mapping_template` | Reusable org/source/channel/segment mapping configuration |
| `validation_event` | Actionable row or batch errors, warnings, and information |
| `column_profile` | Detected types, samples, hints, suggestions, confidence |
| `import_operation` | Restart-safe async state, progress, lease, retry timing, request snapshot |
| `commit_item` | Frozen commit membership, chunk order, and per-row Catalog outcome |
| `outbox_event` | Transactional event payload, lease, retry, and publication state |

All customer-owned tables carry `org_id`, force PostgreSQL RLS, and use composite tenant foreign keys. Application transactions set `app.org_id` locally. Missing tenant context returns no rows and rejects writes.

## Locked Rules

1. Original files and `raw_data` are immutable and retained indefinitely.
2. `mapped_data` never overwrites raw input and is eligible for cleanup after 30 days.
3. CSV and XLSX are the MVP source types.
4. Money is represented in integer minor units; floats are prohibited.
5. Unsupported currency conversion produces an actionable validation error until Phase 7 FX support.
6. Error rows cannot commit; warning rows require explicit confirmation.
7. Commit uses Catalog `source_type = IMPORT`, `source_ref = batch_id`, and `source_item_ref = row_id`.
8. Catalog dimensions must exist before commit; imports do not create channels or segments implicitly.
9. Catalog calls use stable chunk idempotency keys and handle row outcomes independently.
10. `import.committed` uses `batch_id` as the Kafka partition key and includes ok, warned, excluded, and errored counts.

## Runtime Configuration

Required in production:

- `DATA_PIPELINE_DATABASE_URL`
- `DATA_PIPELINE_SERVICE_SECRETS_JSON`
- worker: `DATA_PIPELINE_CATALOG_SERVICE_SECRET`, `KAFKA_BROKERS`

Important optional settings:

- `DATA_PIPELINE_GRPC_HOST`, `DATA_PIPELINE_GRPC_PORT`
- `DATA_PIPELINE_HEALTH_HOST`, `DATA_PIPELINE_HEALTH_PORT`
- `DATA_PIPELINE_GRPC_WORKERS`
- `DATA_PIPELINE_DATABASE_STATEMENT_TIMEOUT_MS`
- `DATA_PIPELINE_SERVICE_JWT_ISSUER`, `DATA_PIPELINE_SERVICE_JWT_AUDIENCE`
- `DATA_PIPELINE_WORKER_POLL_SECONDS`
- `DATA_PIPELINE_OBJECT_STORE_ENDPOINT`, `DATA_PIPELINE_OBJECT_STORE_BUCKET`
- `DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY`, `DATA_PIPELINE_OBJECT_STORE_SECRET_KEY`
- `DATA_PIPELINE_OBJECT_STORE_SECURE`
- `DATA_PIPELINE_UPLOAD_MAX_BYTES`, `DATA_PIPELINE_IMPORT_MAX_ROWS`
- `DATA_PIPELINE_IMPORT_MAX_COLUMNS`, `DATA_PIPELINE_IMPORT_INSERT_BATCH_SIZE`
- `DATA_PIPELINE_WORKER_LEASE_SECONDS`, `DATA_PIPELINE_WORKER_RETRY_BASE_SECONDS`
- `DATA_PIPELINE_KAFKA_CLIENT_ID`
- `DATA_PIPELINE_OUTBOX_BATCH_SIZE`, `DATA_PIPELINE_OUTBOX_LEASE_SECONDS`
- `LOG_LEVEL`

## Verification

```bash
make proto
make lint
make data-pipeline-test
make data-pipeline-integration-test
bazel test //...
```

The integration target requires Docker and verifies migration apply/rollback, eight-table shape,
forced RLS, tenant isolation, async parsing/profiling/mapping/validation/commit, immutable raw
data, fixed 500-row Catalog chunks, warning confirmation, partial rejection, and outbox creation.
