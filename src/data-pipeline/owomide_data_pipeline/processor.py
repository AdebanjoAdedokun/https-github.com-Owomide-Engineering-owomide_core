from __future__ import annotations

import logging
from collections.abc import Iterator
from tempfile import SpooledTemporaryFile
from uuid import UUID

from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.mapping import map_row, mapping_from_operation_payload
from owomide_data_pipeline.parsers import ParsedRow, iter_csv_rows, iter_xlsx_rows
from owomide_data_pipeline.profiler import ColumnProfiler, ProfiledColumn
from owomide_data_pipeline.repository import ClaimedOperation, ImportRepository
from owomide_data_pipeline.storage import ObjectStore


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
