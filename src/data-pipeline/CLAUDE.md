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

Feature handlers intentionally return `UNIMPLEMENTED` until their owning phase lands. F2.2 adds upload/storage/parse, F2.3 profiling, F2.4 mappings, F2.5 validation, and F2.6 Catalog commit/events.

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
| `import_operation` | Restart-safe async operation state, progress, lease, retry timing |

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

Important optional settings:

- `DATA_PIPELINE_GRPC_HOST`, `DATA_PIPELINE_GRPC_PORT`
- `DATA_PIPELINE_HEALTH_HOST`, `DATA_PIPELINE_HEALTH_PORT`
- `DATA_PIPELINE_GRPC_WORKERS`
- `DATA_PIPELINE_DATABASE_STATEMENT_TIMEOUT_MS`
- `DATA_PIPELINE_SERVICE_JWT_ISSUER`, `DATA_PIPELINE_SERVICE_JWT_AUDIENCE`
- `DATA_PIPELINE_WORKER_POLL_SECONDS`
- `LOG_LEVEL`

## Verification

```bash
make proto
make lint
make data-pipeline-test
make data-pipeline-integration-test
bazel test //...
```

The integration target requires Docker and verifies migration apply/rollback, six-table shape, forced RLS, and cross-tenant foreign-key rejection.
