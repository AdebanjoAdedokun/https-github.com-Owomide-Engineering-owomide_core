from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from tempfile import SpooledTemporaryFile
from uuid import UUID

from services.catalog.v1 import catalog_pb2

from owomide_data_pipeline.canonical import canonical_row
from owomide_data_pipeline.catalog import CatalogLoader, CatalogWriter
from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.intelligence.fx import FxCalculator, FxError
from owomide_data_pipeline.mapping import map_row, mapping_from_operation_payload
from owomide_data_pipeline.parsers import ParsedRow, iter_csv_rows, iter_xlsx_rows
from owomide_data_pipeline.profiler import ColumnProfiler, ProfiledColumn
from owomide_data_pipeline.repository import (
    CatalogRowResultRecord,
    ClaimedOperation,
    ImportRepository,
)
from owomide_data_pipeline.storage import ObjectStore
from owomide_data_pipeline.transformations import TransformationError, apply_transformations
from owomide_data_pipeline.validation import validate_row


class ImportProcessor:
    def __init__(
        self,
        *,
        repository: ImportRepository,
        object_store: ObjectStore,
        worker_id: str,
        lease_seconds: int,
        retry_base_seconds: int,
        max_rows: int,
        max_columns: int,
        insert_batch_size: int,
        xlsx_spool_memory_bytes: int,
        catalog_client: CatalogLoader | CatalogWriter | None = None,
        fx_calculator: FxCalculator | None = None,
    ) -> None:
        self._repository = repository
        self._object_store = object_store
        self._worker_id = worker_id
        self._lease_seconds = lease_seconds
        self._retry_base_seconds = retry_base_seconds
        self._max_rows = max_rows
        self._max_columns = max_columns
        self._insert_batch_size = insert_batch_size
        self._xlsx_spool_memory_bytes = xlsx_spool_memory_bytes
        self._catalog_client = catalog_client
        self._fx_calculator = fx_calculator

    def process_once(self) -> bool:
        operation = self._repository.claim_import_operation(
            self._worker_id,
            self._lease_seconds,
        )
        if operation is None:
            return False

        try:
            if operation.operation_type == "parse_profile":
                profiles, total = self._parse(operation)
                self._repository.complete_profile(
                    operation,
                    self._worker_id,
                    profiles,
                    total,
                )
                logging.info(
                    "Parsed and profiled import batch %s with %s rows",
                    operation.batch_id,
                    total,
                )
            elif operation.operation_type == "apply_mapping":
                total, template_id = self._apply_mapping(operation)
                self._repository.complete_mapping(
                    operation,
                    self._worker_id,
                    total,
                    template_id,
                )
                logging.info(
                    "Mapped import batch %s with %s rows",
                    operation.batch_id,
                    total,
                )
            elif operation.operation_type == "validate":
                counts, total = self._validate(operation)
                logging.info(
                    "Validated import batch %s: ok=%s warned=%s excluded=%s errored=%s",
                    operation.batch_id,
                    counts.ok,
                    counts.warned,
                    counts.excluded,
                    counts.errored,
                )
            elif operation.operation_type == "commit":
                result = self._commit(operation)
                logging.info(
                    "Committed import batch %s: created=%s updated=%s unchanged=%s rejected=%s",
                    operation.batch_id,
                    result.catalog_summary.created,
                    result.catalog_summary.updated,
                    result.catalog_summary.unchanged,
                    result.catalog_summary.rejected,
                )
            else:
                raise InvalidImportError(
                    f"Unsupported import operation type: {operation.operation_type}"
                )
        except InvalidImportError as exc:
            self._repository.fail_operation(
                operation,
                self._worker_id,
                str(exc),
                permanent=True,
                retry_delay_seconds=0,
            )
            logging.warning("Import operation %s rejected: %s", operation.operation_id, exc)
        except Exception as exc:
            retry_delay = self._retry_base_seconds * (2 ** max(operation.attempt_count - 1, 0))
            self._repository.fail_operation(
                operation,
                self._worker_id,
                str(exc),
                permanent=False,
                retry_delay_seconds=min(retry_delay, 3_600),
            )
            logging.exception("Import operation %s failed", operation.operation_id)
        return True

    def _parse(self, operation: ClaimedOperation) -> tuple[tuple[ProfiledColumn, ...], int]:
        profiler = ColumnProfiler()
        with self._object_store.open(operation.source_file_url) as source:
            if operation.source_type == "csv":
                rows = iter_csv_rows(
                    source,
                    max_rows=self._max_rows,
                    max_columns=self._max_columns,
                )
                total = self._persist(operation, rows, profiler)
                return profiler.finish(), total
            if operation.source_type == "xlsx":
                with SpooledTemporaryFile(max_size=self._xlsx_spool_memory_bytes) as spool:
                    bytes_since_heartbeat = 0
                    while chunk := source.read(1024 * 1024):
                        spool.write(chunk)
                        bytes_since_heartbeat += len(chunk)
                        if bytes_since_heartbeat >= 8 * 1024 * 1024:
                            self._repository.heartbeat(operation, self._worker_id)
                            bytes_since_heartbeat = 0
                    spool.seek(0)
                    rows = iter_xlsx_rows(
                        spool,
                        max_rows=self._max_rows,
                        max_columns=self._max_columns,
                    )
                    total = self._persist(operation, rows, profiler)
                return profiler.finish(), total
        raise InvalidImportError(f"Unsupported import source type: {operation.source_type}")

    def _apply_mapping(self, operation: ClaimedOperation) -> tuple[int, UUID | None]:
        mappings, _transformation_rules, raw_template_id = mapping_from_operation_payload(
            operation.request_payload
        )
        try:
            template_id = UUID(raw_template_id) if raw_template_id is not None else None
        except ValueError as exc:
            raise InvalidImportError("Mapping operation template_id is invalid") from exc

        progress = 0
        for rows in self._repository.iter_mapping_rows(operation, self._insert_batch_size):
            mapped_rows = [(row.id, map_row(row.raw_data, mappings)) for row in rows]
            progress += len(mapped_rows)
            self._repository.apply_mapped_rows(
                operation=operation,
                worker_id=self._worker_id,
                rows=mapped_rows,
                progress=progress,
            )
        return progress, template_id

    def _validate(self, operation: ClaimedOperation):
        if self._catalog_client is None:
            raise RuntimeError("Catalog client is required for validation operations")
        mappings, transformation_rules, _ = mapping_from_operation_payload(
            operation.request_payload
        )
        batch = self._repository.start_validation(operation, self._worker_id)
        raw_sku_ids = self._repository.collect_validation_sku_ids(operation)
        valid_sku_ids: list[str] = []
        for raw in raw_sku_ids:
            try:
                valid_sku_ids.append(str(UUID(raw)))
            except ValueError:
                continue
        snapshot = self._catalog_client.load_snapshot(operation.org_id, valid_sku_ids)

        recorded_raw = operation.request_payload.get("fx_recorded_as_of")
        try:
            recorded_as_of = (
                datetime.fromisoformat(str(recorded_raw).replace("Z", "+00:00"))
                if recorded_raw is not None
                else None
            )
        except ValueError as exc:
            raise InvalidImportError("FX recorded-as-of snapshot is invalid") from exc
        if recorded_as_of is not None:
            if recorded_as_of.tzinfo is None:
                raise InvalidImportError("FX recorded-as-of snapshot must include a timezone")
            recorded_as_of = recorded_as_of.astimezone(UTC)
        rate_cache: dict[tuple[str, str, str, datetime], Decimal] = {}

        def resolve_fx_rate(
            source_currency: str,
            target_currency: str,
            source_name: str,
            effective_at: datetime,
        ) -> Decimal:
            if self._fx_calculator is None:
                raise TransformationError("FX calculator is unavailable")
            if recorded_as_of is None:
                raise TransformationError("FX recorded-as-of snapshot is unavailable")
            key = (source_currency, target_currency, source_name, effective_at)
            if key not in rate_cache:
                try:
                    rate_cache[key] = self._fx_calculator.quote(
                        org_id=operation.org_id,
                        source_currency=source_currency,
                        target_currency=target_currency,
                        rate_source_name=source_name,
                        effective_at=effective_at,
                        recorded_as_of=recorded_as_of,
                    ).rate
                except FxError as exc:
                    raise TransformationError(str(exc)) from exc
            return rate_cache[key]

        progress = 0
        for rows in self._repository.iter_validation_rows(operation, self._insert_batch_size):
            validated_rows = []
            for row in rows:
                if row.row_status == "excluded":
                    continue
                transformed, failures = apply_transformations(
                    row.mapped_data,
                    mappings,
                    transformation_rules,
                    fx_rate_resolver=resolve_fx_rate,
                )
                mapped_data, findings = validate_row(
                    transformed,
                    row_number=row.row_number,
                    batch_channel_id=batch.channel_id,
                    batch_customer_segment_id=batch.customer_segment_id,
                    snapshot=snapshot,
                    transformation_failures=failures,
                )
                validated_rows.append((row.id, mapped_data, findings))
            progress += len(rows)
            self._repository.apply_validated_rows(
                operation=operation,
                worker_id=self._worker_id,
                rows=validated_rows,
                progress=progress,
            )
        return self._repository.complete_validation(
            operation,
            self._worker_id,
            progress,
        ), progress

    def _commit(self, operation: ClaimedOperation):
        if self._catalog_client is None:
            raise RuntimeError("Catalog client is required for commit operations")
        batch = self._repository.get_batch(operation.org_id, operation.batch_id)
        if batch is None:
            raise RuntimeError("Import batch not found during commit")

        for chunk_index, rows in self._repository.iter_commit_chunks(operation):
            pending = [row for row in rows if row.catalog_status == "pending"]
            canonical_rows = []
            local_rejections = []
            for row in pending:
                try:
                    canonical_rows.append(
                        canonical_row(row_id=str(row.row_id), mapped_data=row.mapped_data)
                    )
                except InvalidImportError as exc:
                    local_rejections.append(
                        CatalogRowResultRecord(
                            row_id=row.row_id,
                            status="rejected",
                            errors=(
                                {
                                    "code": "invalid_canonical_row",
                                    "message": str(exc),
                                    "field": None,
                                },
                            ),
                        )
                    )
            if local_rejections:
                self._repository.record_commit_results(
                    operation=operation,
                    worker_id=self._worker_id,
                    results=local_rejections,
                    catalog_operation_id=None,
                    catalog_replayed=False,
                )
            if not canonical_rows:
                continue
            response = self._catalog_client.upsert_canonical(
                org_id=operation.org_id,
                batch_id=str(operation.batch_id),
                actor_id=batch.owner_id,
                chunk_index=chunk_index,
                rows=canonical_rows,
            )
            expected_refs = {row.source_item_ref for row in canonical_rows}
            actual_refs = {result.source_item_ref for result in response.results}
            if len(actual_refs) != len(response.results) or actual_refs != expected_refs:
                raise RuntimeError("Catalog response did not match the committed row set")
            results = []
            for row_result in response.results:
                status_name = catalog_pb2.WriteStatus.Name(row_result.status)
                status = status_name.removeprefix("WRITE_STATUS_").lower()
                errors = tuple(
                    {
                        "code": catalog_pb2.CatalogErrorCode.Name(error.code)
                        .removeprefix("CATALOG_ERROR_CODE_")
                        .lower(),
                        "message": error.message,
                        "field": error.field if error.HasField("field") else None,
                    }
                    for error in row_result.errors
                )
                results.append(
                    CatalogRowResultRecord(
                        row_id=UUID(row_result.source_item_ref),
                        status=status,
                        errors=errors,
                    )
                )
            self._repository.record_commit_results(
                operation=operation,
                worker_id=self._worker_id,
                results=results,
                catalog_operation_id=response.operation_id,
                catalog_replayed=response.replayed,
            )
        return self._repository.complete_commit(operation, self._worker_id)

    def _persist(
        self,
        operation: ClaimedOperation,
        rows: Iterator[ParsedRow],
        profiler: ColumnProfiler,
    ) -> int:
        batch: list[tuple[int, dict[str, object]]] = []
        progress = 0
        for parsed in rows:
            profiler.observe(parsed.raw_data)
            batch.append((parsed.row_number, parsed.raw_data))
            progress += 1
            if len(batch) >= self._insert_batch_size:
                self._repository.append_rows(
                    operation=operation,
                    worker_id=self._worker_id,
                    rows=batch,
                    progress=progress,
                )
                batch = []
        if batch:
            self._repository.append_rows(
                operation=operation,
                worker_id=self._worker_id,
                rows=batch,
                progress=progress,
            )
        return progress
