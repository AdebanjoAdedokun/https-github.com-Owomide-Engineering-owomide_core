from __future__ import annotations

import logging
from collections.abc import Iterator
from tempfile import SpooledTemporaryFile

from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.parsers import ParsedRow, iter_csv_rows, iter_xlsx_rows
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
        operation = self._repository.claim_parse_operation(
            self._worker_id,
            self._lease_seconds,
        )
        if operation is None:
            return False

        try:
            self._parse(operation)
            total = self._repository.complete_parse(operation, self._worker_id)
            logging.info(
                "Parsed import batch %s with %s rows",
                operation.batch_id,
                total,
            )
        except InvalidImportError as exc:
            self._repository.fail_parse(
                operation,
                self._worker_id,
                str(exc),
                permanent=True,
                retry_delay_seconds=0,
            )
            logging.warning("Import batch %s rejected: %s", operation.batch_id, exc)
        except Exception as exc:
            retry_delay = self._retry_base_seconds * (2 ** max(operation.attempt_count - 1, 0))
            self._repository.fail_parse(
                operation,
                self._worker_id,
                str(exc),
                permanent=False,
                retry_delay_seconds=min(retry_delay, 3_600),
            )
            logging.exception("Import batch %s processing failed", operation.batch_id)
        return True

    def _parse(self, operation: ClaimedOperation) -> None:
        with self._object_store.open(operation.source_file_url) as source:
            if operation.source_type == "csv":
                rows = iter_csv_rows(
                    source,
                    max_rows=self._max_rows,
                    max_columns=self._max_columns,
                )
                self._persist(operation, rows)
                return
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
                    self._persist(operation, rows)
                return
        raise InvalidImportError(f"Unsupported import source type: {operation.source_type}")

    def _persist(self, operation: ClaimedOperation, rows: Iterator[ParsedRow]) -> None:
        batch: list[tuple[int, dict[str, object]]] = []
        progress = 0
        for parsed in rows:
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
