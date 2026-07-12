from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from owomide_data_pipeline.db import Database
from owomide_data_pipeline.profiler import ProfiledColumn


@dataclass(frozen=True, slots=True)
class ImportBatchRecord:
    id: UUID
    org_id: str
    owner_id: str
    source_file_url: str
    source_filename: str
    source_type: str
    source_sha256: str
    status: str
    source_system: str | None
    channel_id: str | None
    customer_segment_id: str | None
    template_id: UUID | None
    failed_reason: str | None
    created_at: datetime
    updated_at: datetime
    committed_at: datetime | None


@dataclass(frozen=True, slots=True)
class ImportOperationRecord:
    id: UUID
    org_id: str
    batch_id: UUID
    operation_type: str
    status: str
    attempt_count: int
    max_attempts: int
    progress_current: int
    progress_total: int
    error_message: str | None
    next_attempt_at: datetime
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


@dataclass(frozen=True, slots=True)
class ClaimedOperation:
    operation_id: UUID
    org_id: str
    batch_id: UUID
    attempt_count: int
    max_attempts: int
    source_file_url: str
    source_filename: str
    source_type: str


@dataclass(frozen=True, slots=True)
class ColumnProfileRecord:
    id: UUID
    org_id: str
    batch_id: UUID
    column_name: str
    ordinal_position: int
    detected_type: str
    sample_values: tuple[str, ...]
    currency_hint: str | None
    date_hint: str | None
    suggested_mapping: str | None
    confidence: Decimal


@dataclass(frozen=True, slots=True)
class ColumnProfileState:
    columns: tuple[ColumnProfileRecord, ...]
    operation: ImportOperationRecord | None


@dataclass(frozen=True, slots=True)
class ListBatchesResult:
    batches: tuple[ImportBatchRecord, ...]
    next_page_token: str
    total_count: int


def _batch(row: dict[str, Any]) -> ImportBatchRecord:
    fields = ImportBatchRecord.__dataclass_fields__
    return ImportBatchRecord(**{field: row[field] for field in fields})


def _operation(row: dict[str, Any]) -> ImportOperationRecord:
    fields = ImportOperationRecord.__dataclass_fields__
    return ImportOperationRecord(**{field: row[field] for field in fields})


def _column_profile(row: dict[str, Any]) -> ColumnProfileRecord:
    return ColumnProfileRecord(
        id=row["id"],
        org_id=row["org_id"],
        batch_id=row["batch_id"],
        column_name=row["column_name"],
        ordinal_position=row["ordinal_position"],
        detected_type=row["detected_type"],
        sample_values=tuple(row["sample_values"]),
        currency_hint=row["currency_hint"],
        date_hint=row["date_hint"],
        suggested_mapping=row["suggested_mapping"],
        confidence=row["confidence"],
    )


def _encode_cursor(created_at: datetime, batch_id: UUID) -> str:
    raw = json.dumps(
        {"created_at": created_at.astimezone(UTC).isoformat(), "id": str(batch_id)},
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(token: str) -> tuple[datetime, UUID] | None:
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded).decode())
        created_at = datetime.fromisoformat(value["created_at"])
        if created_at.tzinfo is None:
            raise ValueError("cursor timestamp must include a timezone")
        return created_at, UUID(value["id"])
    except (binascii.Error, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("page_token is invalid") from exc


class ImportRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create_import(
        self,
        *,
        batch_id: UUID,
        operation_id: UUID,
        org_id: str,
        owner_id: str,
        source_file_url: str,
        source_filename: str,
        source_type: str,
        source_sha256: str,
        source_system: str | None,
        channel_id: str | None,
        customer_segment_id: str | None,
    ) -> tuple[UUID, UUID]:
        with self._database.transaction(org_id) as connection:
            connection.execute(
                """
                INSERT INTO data_pipeline.import_batch (
                    id, org_id, owner_id, source_file_url, source_filename, source_type,
                    source_sha256, source_system, channel_id, customer_segment_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    batch_id,
                    org_id,
                    owner_id,
                    source_file_url,
                    source_filename,
                    source_type,
                    source_sha256,
                    source_system,
                    channel_id,
                    customer_segment_id,
                ),
            )
            connection.execute(
                """
                INSERT INTO data_pipeline.import_operation (
                    id, org_id, batch_id, operation_type, status
                ) VALUES (%s, %s, %s, 'parse_profile', 'queued')
                """,
                (operation_id, org_id, batch_id),
            )
        return batch_id, operation_id

    def get_batch(self, org_id: str, batch_id: UUID) -> ImportBatchRecord | None:
        with self._database.transaction(org_id) as connection:
            row = connection.execute(
                "SELECT * FROM data_pipeline.import_batch WHERE id = %s",
                (batch_id,),
            ).fetchone()
        return _batch(row) if row else None

    def list_batches(
        self,
        *,
        org_id: str,
        status: str | None,
        page_size: int,
        page_token: str,
    ) -> ListBatchesResult:
        limit = 50 if page_size == 0 else min(page_size, 200)
        if page_size < 0:
            raise ValueError("page_size is invalid")
        cursor = _decode_cursor(page_token)
        cursor_created_at, cursor_id = cursor or (None, None)

        with self._database.transaction(org_id) as connection:
            rows = connection.execute(
                """
                SELECT * FROM data_pipeline.import_batch
                WHERE org_id = %s
                  AND (%s::text IS NULL OR status = %s)
                  AND (
                      %s::timestamptz IS NULL
                      OR (created_at, id) < (%s::timestamptz, %s::uuid)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (
                    org_id,
                    status,
                    status,
                    cursor_created_at,
                    cursor_created_at,
                    cursor_id,
                    limit + 1,
                ),
            ).fetchall()
            total = connection.execute(
                """
                SELECT count(*) AS count FROM data_pipeline.import_batch
                WHERE org_id = %s AND (%s::text IS NULL OR status = %s)
                """,
                (org_id, status, status),
            ).fetchone()["count"]

        page = rows[:limit]
        next_token = ""
        if len(rows) > limit:
            last = page[-1]
            next_token = _encode_cursor(last["created_at"], last["id"])
        return ListBatchesResult(
            batches=tuple(_batch(row) for row in page),
            next_page_token=next_token,
            total_count=total,
        )

    def get_operation(self, org_id: str, operation_id: UUID) -> ImportOperationRecord | None:
        with self._database.transaction(org_id) as connection:
            row = connection.execute(
                "SELECT * FROM data_pipeline.import_operation WHERE id = %s",
                (operation_id,),
            ).fetchone()
        return _operation(row) if row else None

    def get_column_profile_state(
        self,
        org_id: str,
        batch_id: UUID,
    ) -> ColumnProfileState | None:
        with self._database.transaction(org_id) as connection:
            batch = connection.execute(
                "SELECT id FROM data_pipeline.import_batch WHERE id = %s",
                (batch_id,),
            ).fetchone()
            if batch is None:
                return None
            rows = connection.execute(
                """
                SELECT * FROM data_pipeline.column_profile
                WHERE batch_id = %s
                ORDER BY ordinal_position
                """,
                (batch_id,),
            ).fetchall()
            operation = connection.execute(
                """
                SELECT * FROM data_pipeline.import_operation
                WHERE batch_id = %s AND operation_type = 'parse_profile'
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (batch_id,),
            ).fetchone()
        return ColumnProfileState(
            columns=tuple(_column_profile(row) for row in rows),
            operation=_operation(operation) if operation else None,
        )

    def claim_parse_operation(self, worker_id: str, lease_seconds: int) -> ClaimedOperation | None:
        with self._database.system_transaction() as connection:
            row = connection.execute(
                "SELECT * FROM data_pipeline.claim_parse_operation(%s, %s)",
                (worker_id, lease_seconds),
            ).fetchone()
        if not row:
            return None
        return ClaimedOperation(
            operation_id=row["operation_id"],
            org_id=row["operation_org_id"],
            batch_id=row["batch_id"],
            attempt_count=row["attempt_count"],
            max_attempts=row["max_attempts"],
            source_file_url=row["source_file_url"],
            source_filename=row["source_filename"],
            source_type=row["source_type"],
        )

    def append_rows(
        self,
        *,
        operation: ClaimedOperation,
        worker_id: str,
        rows: list[tuple[int, dict[str, object]]],
        progress: int,
    ) -> None:
        with self._database.transaction(operation.org_id) as connection:
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO data_pipeline.import_row (
                        org_id, batch_id, row_number, raw_data
                    ) VALUES (%s, %s, %s, %s)
                    ON CONFLICT (org_id, batch_id, row_number) DO NOTHING
                    """,
                    [
                        (operation.org_id, operation.batch_id, row_number, Jsonb(raw_data))
                        for row_number, raw_data in rows
                    ],
                )
            updated = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET progress_current = %s,
                    progress_total = %s,
                    locked_at = clock_timestamp(),
                    updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (progress, progress, operation.operation_id, worker_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")

    def heartbeat(self, operation: ClaimedOperation, worker_id: str) -> None:
        with self._database.transaction(operation.org_id) as connection:
            updated = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET locked_at = clock_timestamp(), updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (operation.operation_id, worker_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")

    def complete_profile(
        self,
        operation: ClaimedOperation,
        worker_id: str,
        profiles: tuple[ProfiledColumn, ...],
        total_rows: int,
    ) -> None:
        with self._database.transaction(operation.org_id) as connection:
            updated = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET status = 'succeeded',
                    progress_current = %s,
                    progress_total = %s,
                    locked_by = NULL,
                    locked_at = NULL,
                    finished_at = clock_timestamp(),
                    updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (total_rows, total_rows, operation.operation_id, worker_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")
            connection.execute(
                "DELETE FROM data_pipeline.column_profile WHERE batch_id = %s",
                (operation.batch_id,),
            )
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO data_pipeline.column_profile (
                        org_id, batch_id, column_name, ordinal_position, detected_type,
                        sample_values, currency_hint, date_hint, suggested_mapping, confidence
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            operation.org_id,
                            operation.batch_id,
                            profile.column_name,
                            profile.ordinal_position,
                            profile.detected_type,
                            Jsonb(list(profile.sample_values)),
                            profile.currency_hint,
                            profile.date_hint,
                            profile.suggested_mapping,
                            profile.confidence,
                        )
                        for profile in profiles
                    ],
                )
            batch_updated = connection.execute(
                """
                UPDATE data_pipeline.import_batch
                SET status = 'profiled', failed_reason = NULL, updated_at = clock_timestamp()
                WHERE id = %s AND status = 'parsing'
                """,
                (operation.batch_id,),
            )
            if batch_updated.rowcount != 1:
                raise RuntimeError("Import batch was not in the parsing state")

    def fail_parse(
        self,
        operation: ClaimedOperation,
        worker_id: str,
        message: str,
        *,
        permanent: bool,
        retry_delay_seconds: int,
    ) -> None:
        terminal = permanent or operation.attempt_count >= operation.max_attempts
        error_message = message.strip()[:2_000] or "Import processing failed"
        with self._database.transaction(operation.org_id) as connection:
            if terminal:
                updated = connection.execute(
                    """
                    UPDATE data_pipeline.import_operation
                    SET status = 'failed', error_message = %s,
                        locked_by = NULL, locked_at = NULL,
                        finished_at = clock_timestamp(), updated_at = clock_timestamp()
                    WHERE id = %s AND status = 'running' AND locked_by = %s
                    """,
                    (error_message, operation.operation_id, worker_id),
                )
                connection.execute(
                    """
                    UPDATE data_pipeline.import_batch
                    SET status = 'failed', failed_reason = %s, updated_at = clock_timestamp()
                    WHERE id = %s
                    """,
                    (error_message, operation.batch_id),
                )
            else:
                updated = connection.execute(
                    """
                    UPDATE data_pipeline.import_operation
                    SET status = 'queued', error_message = %s,
                        locked_by = NULL, locked_at = NULL,
                        next_attempt_at = clock_timestamp() + (%s * interval '1 second'),
                        updated_at = clock_timestamp()
                    WHERE id = %s AND status = 'running' AND locked_by = %s
                    """,
                    (
                        error_message,
                        retry_delay_seconds,
                        operation.operation_id,
                        worker_id,
                    ),
                )
                connection.execute(
                    """
                    UPDATE data_pipeline.import_batch
                    SET status = 'uploaded', failed_reason = NULL, updated_at = clock_timestamp()
                    WHERE id = %s
                    """,
                    (operation.batch_id,),
                )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")
