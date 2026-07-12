from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import psycopg
from psycopg.types.json import Jsonb

from owomide_data_pipeline.db import Database
from owomide_data_pipeline.errors import (
    ImportConflictError,
    ImportResourceNotFoundError,
    ImportStateError,
    InvalidImportError,
)
from owomide_data_pipeline.mapping import operation_mapping_payload
from owomide_data_pipeline.profiler import ProfiledColumn
from owomide_data_pipeline.validation import ValidationFinding


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
    operation_type: str
    attempt_count: int
    max_attempts: int
    request_payload: dict[str, object]
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
class MappingTemplateRecord:
    id: UUID
    org_id: str
    name: str
    source_system: str | None
    channel_id: str | None
    customer_segment_id: str | None
    mappings: dict[str, str]
    transformation_rules: tuple[dict[str, object], ...]
    created_by: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class MappingRowRecord:
    id: UUID
    row_number: int
    raw_data: dict[str, object]


@dataclass(frozen=True, slots=True)
class ValidationRowRecord:
    id: UUID
    row_number: int
    mapped_data: dict[str, object]
    row_status: str


@dataclass(frozen=True, slots=True)
class ImportRowRecord:
    id: UUID
    org_id: str
    batch_id: UUID
    row_number: int
    raw_data: dict[str, object]
    mapped_data: dict[str, object] | None
    row_status: str
    excluded_reason: str | None


@dataclass(frozen=True, slots=True)
class ValidationEventRecord:
    id: UUID
    org_id: str
    batch_id: UUID
    row_id: UUID | None
    severity: str
    code: str
    message: str
    field: str | None
    raw_value: str | None
    suggested_fix: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class RowCountsRecord:
    ok: int
    warned: int
    excluded: int
    errored: int


@dataclass(frozen=True, slots=True)
class ValidationReportState:
    events: tuple[ValidationEventRecord, ...]
    row_counts: RowCountsRecord
    operation: ImportOperationRecord | None
    next_page_token: str
    total_count: int


@dataclass(frozen=True, slots=True)
class ListBatchesResult:
    batches: tuple[ImportBatchRecord, ...]
    next_page_token: str
    total_count: int


@dataclass(frozen=True, slots=True)
class ListMappingTemplatesResult:
    templates: tuple[MappingTemplateRecord, ...]
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


def _mapping_template(row: dict[str, Any]) -> MappingTemplateRecord:
    return MappingTemplateRecord(
        id=row["id"],
        org_id=row["org_id"],
        name=row["name"],
        source_system=row["source_system"],
        channel_id=row["channel_id"],
        customer_segment_id=row["customer_segment_id"],
        mappings=dict(row["mappings"]),
        transformation_rules=tuple(dict(rule) for rule in row["transformation_rules"]),
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _import_row(row: dict[str, Any]) -> ImportRowRecord:
    return ImportRowRecord(
        id=row["id"],
        org_id=row["org_id"],
        batch_id=row["batch_id"],
        row_number=row["row_number"],
        raw_data=dict(row["raw_data"]),
        mapped_data=dict(row["mapped_data"]) if row["mapped_data"] is not None else None,
        row_status=row["row_status"],
        excluded_reason=row["excluded_reason"],
    )


def _validation_event(row: dict[str, Any]) -> ValidationEventRecord:
    fields = ValidationEventRecord.__dataclass_fields__
    return ValidationEventRecord(**{field: row[field] for field in fields})


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

    @staticmethod
    def _row_counts(connection, batch_id: UUID) -> RowCountsRecord:
        row = connection.execute(
            """
            SELECT
                count(*) FILTER (
                    WHERE import_row.row_status = 'validated'
                      AND NOT EXISTS (
                          SELECT 1 FROM data_pipeline.validation_event AS event
                          WHERE event.row_id = import_row.id AND event.severity = 'warning'
                      )
                ) AS ok,
                count(*) FILTER (
                    WHERE import_row.row_status = 'validated'
                      AND EXISTS (
                          SELECT 1 FROM data_pipeline.validation_event AS event
                          WHERE event.row_id = import_row.id AND event.severity = 'warning'
                      )
                ) AS warned,
                count(*) FILTER (WHERE import_row.row_status = 'excluded') AS excluded,
                count(*) FILTER (WHERE import_row.row_status = 'errored') AS errored
            FROM data_pipeline.import_row AS import_row
            WHERE import_row.batch_id = %s
            """,
            (batch_id,),
        ).fetchone()
        return RowCountsRecord(
            ok=row["ok"],
            warned=row["warned"],
            excluded=row["excluded"],
            errored=row["errored"],
        )

    def get_validation_report(
        self,
        *,
        org_id: str,
        batch_id: UUID,
        page_size: int,
        page_token: str,
    ) -> ValidationReportState | None:
        limit = 50 if page_size == 0 else min(page_size, 200)
        if page_size < 0:
            raise ValueError("page_size is invalid")
        cursor = _decode_cursor(page_token)
        cursor_created_at, cursor_id = cursor or (None, None)
        with self._database.transaction(org_id) as connection:
            batch = connection.execute(
                "SELECT id FROM data_pipeline.import_batch WHERE id = %s",
                (batch_id,),
            ).fetchone()
            if batch is None:
                return None
            rows = connection.execute(
                """
                SELECT * FROM data_pipeline.validation_event
                WHERE batch_id = %s
                  AND (
                      %s::timestamptz IS NULL
                      OR (created_at, id) < (%s::timestamptz, %s::uuid)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (
                    batch_id,
                    cursor_created_at,
                    cursor_created_at,
                    cursor_id,
                    limit + 1,
                ),
            ).fetchall()
            total = connection.execute(
                "SELECT count(*) AS count FROM data_pipeline.validation_event WHERE batch_id = %s",
                (batch_id,),
            ).fetchone()["count"]
            operation = connection.execute(
                """
                SELECT * FROM data_pipeline.import_operation
                WHERE batch_id = %s AND operation_type = 'validate'
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (batch_id,),
            ).fetchone()
            counts = self._row_counts(connection, batch_id)
        page = rows[:limit]
        next_token = ""
        if len(rows) > limit:
            last = page[-1]
            next_token = _encode_cursor(last["created_at"], last["id"])
        return ValidationReportState(
            events=tuple(_validation_event(row) for row in page),
            row_counts=counts,
            operation=_operation(operation) if operation else None,
            next_page_token=next_token,
            total_count=total,
        )

    @staticmethod
    def _queue_revalidation(connection, org_id: str, batch_id: UUID) -> ImportOperationRecord:
        source = connection.execute(
            """
            SELECT request_payload
            FROM data_pipeline.import_operation
            WHERE batch_id = %s
              AND operation_type IN ('apply_mapping', 'validate')
              AND status = 'succeeded'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (batch_id,),
        ).fetchone()
        if source is None:
            raise ImportStateError("Import batch has no completed mapping to validate")
        total = connection.execute(
            "SELECT count(*) AS count FROM data_pipeline.import_row WHERE batch_id = %s",
            (batch_id,),
        ).fetchone()["count"]
        connection.execute(
            "DELETE FROM data_pipeline.validation_event WHERE batch_id = %s",
            (batch_id,),
        )
        connection.execute(
            """
            UPDATE data_pipeline.import_row
            SET row_status = 'mapped', updated_at = clock_timestamp()
            WHERE batch_id = %s AND row_status <> 'excluded'
            """,
            (batch_id,),
        )
        operation = connection.execute(
            """
            INSERT INTO data_pipeline.import_operation (
                id, org_id, batch_id, operation_type, progress_total, request_payload
            ) VALUES (%s, %s, %s, 'validate', %s, %s)
            RETURNING *
            """,
            (uuid4(), org_id, batch_id, total, Jsonb(source["request_payload"])),
        ).fetchone()
        connection.execute(
            """
            UPDATE data_pipeline.import_batch
            SET status = 'mapped', failed_reason = NULL, updated_at = clock_timestamp()
            WHERE id = %s
            """,
            (batch_id,),
        )
        return _operation(operation)

    def edit_row(
        self,
        *,
        org_id: str,
        batch_id: UUID,
        row_id: UUID,
        mapped_data: Mapping[str, object],
    ) -> tuple[ImportRowRecord, ImportOperationRecord]:
        try:
            with self._database.transaction(org_id) as connection:
                batch = connection.execute(
                    "SELECT status FROM data_pipeline.import_batch WHERE id = %s FOR UPDATE",
                    (batch_id,),
                ).fetchone()
                if batch is None:
                    raise ImportResourceNotFoundError("Import batch not found")
                if batch["status"] not in {"mapped", "validated"}:
                    raise ImportStateError(
                        "Rows can only be edited after mapping and before commit"
                    )
                row = connection.execute(
                    """
                    UPDATE data_pipeline.import_row
                    SET mapped_data = %s, updated_at = clock_timestamp()
                    WHERE id = %s AND batch_id = %s
                    RETURNING *
                    """,
                    (Jsonb(dict(mapped_data)), row_id, batch_id),
                ).fetchone()
                if row is None:
                    raise ImportResourceNotFoundError("Import row not found")
                operation = self._queue_revalidation(connection, org_id, batch_id)
        except psycopg.errors.UniqueViolation as exc:
            raise ImportConflictError(
                "Another import operation is already active for this batch"
            ) from exc
        return _import_row(row), operation

    def exclude_row(
        self,
        *,
        org_id: str,
        batch_id: UUID,
        row_id: UUID,
        reason: str,
    ) -> tuple[ImportRowRecord, ImportOperationRecord]:
        try:
            with self._database.transaction(org_id) as connection:
                batch = connection.execute(
                    "SELECT status FROM data_pipeline.import_batch WHERE id = %s FOR UPDATE",
                    (batch_id,),
                ).fetchone()
                if batch is None:
                    raise ImportResourceNotFoundError("Import batch not found")
                if batch["status"] not in {"mapped", "validated"}:
                    raise ImportStateError(
                        "Rows can only be excluded after mapping and before commit"
                    )
                row = connection.execute(
                    """
                    UPDATE data_pipeline.import_row
                    SET row_status = 'excluded',
                        excluded_reason = %s,
                        updated_at = clock_timestamp()
                    WHERE id = %s AND batch_id = %s
                    RETURNING *
                    """,
                    (reason, row_id, batch_id),
                ).fetchone()
                if row is None:
                    raise ImportResourceNotFoundError("Import row not found")
                operation = self._queue_revalidation(connection, org_id, batch_id)
        except psycopg.errors.UniqueViolation as exc:
            raise ImportConflictError(
                "Another import operation is already active for this batch"
            ) from exc
        return _import_row(row), operation

    def get_mapping_template(
        self,
        org_id: str,
        template_id: UUID,
    ) -> MappingTemplateRecord | None:
        with self._database.transaction(org_id) as connection:
            row = connection.execute(
                "SELECT * FROM data_pipeline.mapping_template WHERE id = %s",
                (template_id,),
            ).fetchone()
        return _mapping_template(row) if row else None

    def list_mapping_templates(
        self,
        *,
        org_id: str,
        source_system: str | None,
        channel_id: str | None,
        customer_segment_id: str | None,
        page_size: int,
        page_token: str,
    ) -> ListMappingTemplatesResult:
        limit = 50 if page_size == 0 else min(page_size, 200)
        if page_size < 0:
            raise ValueError("page_size is invalid")
        cursor = _decode_cursor(page_token)
        cursor_updated_at, cursor_id = cursor or (None, None)
        parameters = (
            org_id,
            source_system,
            source_system,
            channel_id,
            channel_id,
            customer_segment_id,
            customer_segment_id,
        )

        with self._database.transaction(org_id) as connection:
            rows = connection.execute(
                """
                SELECT * FROM data_pipeline.mapping_template
                WHERE org_id = %s
                  AND (%s::text IS NULL OR source_system = %s)
                  AND (%s::text IS NULL OR channel_id = %s)
                  AND (%s::text IS NULL OR customer_segment_id = %s)
                  AND (
                      %s::timestamptz IS NULL
                      OR (updated_at, id) < (%s::timestamptz, %s::uuid)
                  )
                ORDER BY updated_at DESC, id DESC
                LIMIT %s
                """,
                (*parameters, cursor_updated_at, cursor_updated_at, cursor_id, limit + 1),
            ).fetchall()
            total = connection.execute(
                """
                SELECT count(*) AS count FROM data_pipeline.mapping_template
                WHERE org_id = %s
                  AND (%s::text IS NULL OR source_system = %s)
                  AND (%s::text IS NULL OR channel_id = %s)
                  AND (%s::text IS NULL OR customer_segment_id = %s)
                """,
                parameters,
            ).fetchone()["count"]

        page = rows[:limit]
        next_token = ""
        if len(rows) > limit:
            last = page[-1]
            next_token = _encode_cursor(last["updated_at"], last["id"])
        return ListMappingTemplatesResult(
            templates=tuple(_mapping_template(row) for row in page),
            next_page_token=next_token,
            total_count=total,
        )

    def save_mapping_template(
        self,
        *,
        org_id: str,
        user_id: str,
        template_id: UUID | None,
        name: str,
        source_system: str | None,
        channel_id: str | None,
        customer_segment_id: str | None,
        mappings: Mapping[str, str],
        transformation_rules: Sequence[Mapping[str, object]],
    ) -> MappingTemplateRecord:
        try:
            with self._database.transaction(org_id) as connection:
                if template_id is None:
                    row = connection.execute(
                        """
                        INSERT INTO data_pipeline.mapping_template (
                            org_id, name, source_system, channel_id, customer_segment_id,
                            mappings, transformation_rules, created_by
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING *
                        """,
                        (
                            org_id,
                            name,
                            source_system,
                            channel_id,
                            customer_segment_id,
                            Jsonb(dict(mappings)),
                            Jsonb([dict(rule) for rule in transformation_rules]),
                            user_id,
                        ),
                    ).fetchone()
                else:
                    row = connection.execute(
                        """
                        UPDATE data_pipeline.mapping_template
                        SET name = %s,
                            source_system = %s,
                            channel_id = %s,
                            customer_segment_id = %s,
                            mappings = %s,
                            transformation_rules = %s,
                            updated_at = clock_timestamp()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (
                            name,
                            source_system,
                            channel_id,
                            customer_segment_id,
                            Jsonb(dict(mappings)),
                            Jsonb([dict(rule) for rule in transformation_rules]),
                            template_id,
                        ),
                    ).fetchone()
                    if row is None:
                        raise ImportResourceNotFoundError("Mapping template not found")
        except psycopg.errors.UniqueViolation as exc:
            raise ImportConflictError(
                "A mapping template with this name and scope already exists"
            ) from exc
        return _mapping_template(row)

    def queue_mapping(
        self,
        *,
        org_id: str,
        mappings: Mapping[str, str],
        transformation_rules: Sequence[Mapping[str, object]],
        batch_id: UUID,
        template: MappingTemplateRecord | None,
    ) -> UUID:
        operation_id = uuid4()
        payload = operation_mapping_payload(
            mappings,
            transformation_rules,
            template_id=str(template.id) if template else None,
            template_updated_at=template.updated_at.astimezone(UTC).isoformat()
            if template
            else None,
        )
        try:
            with self._database.transaction(org_id) as connection:
                if template is not None:
                    current_template = connection.execute(
                        """
                        SELECT updated_at FROM data_pipeline.mapping_template
                        WHERE id = %s
                        FOR SHARE
                        """,
                        (template.id,),
                    ).fetchone()
                    if current_template is None:
                        raise ImportResourceNotFoundError("Mapping template not found")
                    if current_template["updated_at"] != template.updated_at:
                        raise ImportConflictError(
                            "Mapping template changed while the operation was being created"
                        )
                batch = connection.execute(
                    "SELECT status FROM data_pipeline.import_batch WHERE id = %s FOR UPDATE",
                    (batch_id,),
                ).fetchone()
                if batch is None:
                    raise ImportResourceNotFoundError("Import batch not found")
                if batch["status"] not in {"profiled", "mapped"}:
                    raise ImportStateError(
                        "Import batch must be profiled before mappings can be applied"
                    )
                headers = {
                    row["column_name"]
                    for row in connection.execute(
                        "SELECT column_name FROM data_pipeline.column_profile WHERE batch_id = %s",
                        (batch_id,),
                    ).fetchall()
                }
                missing = sorted(set(mappings) - headers)
                if missing:
                    raise InvalidImportError(
                        "Mapped source fields are not present in this import: " + ", ".join(missing)
                    )
                total = connection.execute(
                    "SELECT count(*) AS count FROM data_pipeline.import_row WHERE batch_id = %s",
                    (batch_id,),
                ).fetchone()["count"]
                connection.execute(
                    """
                    INSERT INTO data_pipeline.import_operation (
                        id, org_id, batch_id, operation_type, progress_total, request_payload
                    ) VALUES (%s, %s, %s, 'apply_mapping', %s, %s)
                    """,
                    (operation_id, org_id, batch_id, total, Jsonb(payload)),
                )
        except psycopg.errors.UniqueViolation as exc:
            raise ImportConflictError(
                "Another import operation is already active for this batch"
            ) from exc
        return operation_id

    def claim_import_operation(
        self,
        worker_id: str,
        lease_seconds: int,
    ) -> ClaimedOperation | None:
        with self._database.system_transaction() as connection:
            row = connection.execute(
                "SELECT * FROM data_pipeline.claim_import_operation(%s, %s)",
                (worker_id, lease_seconds),
            ).fetchone()
        if not row:
            return None
        return ClaimedOperation(
            operation_id=row["operation_id"],
            org_id=row["operation_org_id"],
            batch_id=row["batch_id"],
            operation_type=row["operation_type"],
            attempt_count=row["attempt_count"],
            max_attempts=row["max_attempts"],
            request_payload=dict(row["request_payload"]),
            source_file_url=row["source_file_url"],
            source_filename=row["source_filename"],
            source_type=row["source_type"],
        )

    def iter_mapping_rows(
        self,
        operation: ClaimedOperation,
        page_size: int,
    ) -> Iterator[tuple[MappingRowRecord, ...]]:
        last_row_number = 0
        while True:
            with self._database.transaction(operation.org_id) as connection:
                rows = connection.execute(
                    """
                    SELECT id, row_number, raw_data
                    FROM data_pipeline.import_row
                    WHERE batch_id = %s AND row_number > %s
                    ORDER BY row_number
                    LIMIT %s
                    """,
                    (operation.batch_id, last_row_number, page_size),
                ).fetchall()
            if not rows:
                return
            page = tuple(
                MappingRowRecord(
                    id=row["id"],
                    row_number=row["row_number"],
                    raw_data=dict(row["raw_data"]),
                )
                for row in rows
            )
            yield page
            last_row_number = page[-1].row_number

    def apply_mapped_rows(
        self,
        *,
        operation: ClaimedOperation,
        worker_id: str,
        rows: Sequence[tuple[UUID, dict[str, object]]],
        progress: int,
    ) -> None:
        payload = Jsonb(
            [{"id": str(row_id), "mapped_data": mapped_data} for row_id, mapped_data in rows]
        )
        with self._database.transaction(operation.org_id) as connection:
            updated_rows = connection.execute(
                """
                UPDATE data_pipeline.import_row AS import_row
                SET mapped_data = input.mapped_data,
                    row_status = CASE
                        WHEN import_row.row_status = 'excluded' THEN 'excluded'
                        ELSE 'mapped'
                    END,
                    updated_at = clock_timestamp()
                FROM jsonb_to_recordset(%s::jsonb) AS input(id uuid, mapped_data jsonb)
                WHERE import_row.org_id = %s
                  AND import_row.batch_id = %s
                  AND import_row.id = input.id
                """,
                (payload, operation.org_id, operation.batch_id),
            )
            if updated_rows.rowcount != len(rows):
                raise RuntimeError("Import rows changed while mapping was applied")
            updated_operation = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET progress_current = %s,
                    locked_at = clock_timestamp(),
                    updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (progress, operation.operation_id, worker_id),
            )
            if updated_operation.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")

    def complete_mapping(
        self,
        operation: ClaimedOperation,
        worker_id: str,
        total_rows: int,
        template_id: UUID | None,
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
                "DELETE FROM data_pipeline.validation_event WHERE batch_id = %s",
                (operation.batch_id,),
            )
            batch_updated = connection.execute(
                """
                UPDATE data_pipeline.import_batch
                SET status = 'mapped',
                    template_id = %s,
                    failed_reason = NULL,
                    updated_at = clock_timestamp()
                WHERE id = %s AND status IN ('profiled', 'mapped')
                """,
                (template_id, operation.batch_id),
            )
            if batch_updated.rowcount != 1:
                raise RuntimeError("Import batch was not ready for mapping")
            connection.execute(
                """
                INSERT INTO data_pipeline.import_operation (
                    id, org_id, batch_id, operation_type, progress_total, request_payload
                ) VALUES (%s, %s, %s, 'validate', %s, %s)
                """,
                (
                    uuid4(),
                    operation.org_id,
                    operation.batch_id,
                    total_rows,
                    Jsonb(operation.request_payload),
                ),
            )

    def collect_validation_sku_ids(self, operation: ClaimedOperation) -> tuple[str, ...]:
        with self._database.transaction(operation.org_id) as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT mapped_data #>> '{sku,sku_id}' AS sku_id
                FROM data_pipeline.import_row
                WHERE batch_id = %s
                  AND row_status <> 'excluded'
                  AND NULLIF(btrim(mapped_data #>> '{sku,sku_id}'), '') IS NOT NULL
                """,
                (operation.batch_id,),
            ).fetchall()
        return tuple(row["sku_id"] for row in rows)

    def iter_validation_rows(
        self,
        operation: ClaimedOperation,
        page_size: int,
    ) -> Iterator[tuple[ValidationRowRecord, ...]]:
        last_row_number = 0
        while True:
            with self._database.transaction(operation.org_id) as connection:
                rows = connection.execute(
                    """
                    SELECT id, row_number, mapped_data, row_status
                    FROM data_pipeline.import_row
                    WHERE batch_id = %s AND row_number > %s
                    ORDER BY row_number
                    LIMIT %s
                    """,
                    (operation.batch_id, last_row_number, page_size),
                ).fetchall()
            if not rows:
                return
            page = tuple(
                ValidationRowRecord(
                    id=row["id"],
                    row_number=row["row_number"],
                    mapped_data=dict(row["mapped_data"] or {}),
                    row_status=row["row_status"],
                )
                for row in rows
            )
            yield page
            last_row_number = page[-1].row_number

    def start_validation(self, operation: ClaimedOperation, worker_id: str) -> ImportBatchRecord:
        with self._database.transaction(operation.org_id) as connection:
            batch = connection.execute(
                "SELECT * FROM data_pipeline.import_batch WHERE id = %s FOR UPDATE",
                (operation.batch_id,),
            ).fetchone()
            if batch is None or batch["status"] not in {"mapped", "validated"}:
                raise RuntimeError("Import batch was not ready for validation")
            connection.execute(
                "DELETE FROM data_pipeline.validation_event WHERE batch_id = %s",
                (operation.batch_id,),
            )
            connection.execute(
                """
                UPDATE data_pipeline.import_row
                SET row_status = 'mapped', updated_at = clock_timestamp()
                WHERE batch_id = %s AND row_status <> 'excluded'
                """,
                (operation.batch_id,),
            )
            updated = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET progress_current = 0,
                    locked_at = clock_timestamp(),
                    updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (operation.operation_id, worker_id),
            )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")
        return _batch(batch)

    def apply_validated_rows(
        self,
        *,
        operation: ClaimedOperation,
        worker_id: str,
        rows: Sequence[tuple[UUID, dict[str, object], Sequence[ValidationFinding]]],
        progress: int,
    ) -> None:
        row_payload = Jsonb(
            [{"id": str(row_id), "mapped_data": mapped_data} for row_id, mapped_data, _ in rows]
        )
        with self._database.transaction(operation.org_id) as connection:
            updated_rows = connection.execute(
                """
                UPDATE data_pipeline.import_row AS import_row
                SET mapped_data = input.mapped_data,
                    updated_at = clock_timestamp()
                FROM jsonb_to_recordset(%s::jsonb) AS input(id uuid, mapped_data jsonb)
                WHERE import_row.org_id = %s
                  AND import_row.batch_id = %s
                  AND import_row.id = input.id
                  AND import_row.row_status <> 'excluded'
                """,
                (row_payload, operation.org_id, operation.batch_id),
            )
            expected = len(rows)
            if updated_rows.rowcount != expected:
                raise RuntimeError("Import rows changed while validation was applied")
            event_values = [
                (
                    operation.org_id,
                    operation.batch_id,
                    row_id,
                    finding.severity,
                    finding.code,
                    finding.message,
                    finding.field,
                    finding.raw_value,
                    finding.suggested_fix,
                )
                for row_id, _, findings in rows
                for finding in findings
            ]
            if event_values:
                with connection.cursor() as cursor:
                    cursor.executemany(
                        """
                        INSERT INTO data_pipeline.validation_event (
                            org_id, batch_id, row_id, severity, code, message,
                            field, raw_value, suggested_fix
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        event_values,
                    )
            updated_operation = connection.execute(
                """
                UPDATE data_pipeline.import_operation
                SET progress_current = %s,
                    locked_at = clock_timestamp(),
                    updated_at = clock_timestamp()
                WHERE id = %s AND status = 'running' AND locked_by = %s
                """,
                (progress, operation.operation_id, worker_id),
            )
            if updated_operation.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")

    def complete_validation(
        self,
        operation: ClaimedOperation,
        worker_id: str,
        total_rows: int,
    ) -> RowCountsRecord:
        with self._database.transaction(operation.org_id) as connection:
            connection.execute(
                """
                WITH candidates AS (
                    SELECT
                        row.id,
                        row.row_number,
                        COALESCE(
                            NULLIF(btrim(row.mapped_data #>> '{sku,sku_id}'), ''),
                            NULLIF(upper(btrim(row.mapped_data #>> '{sku,sku_code}')), ''),
                            CASE
                                WHEN NULLIF(btrim(
                                    row.mapped_data #>> '{sku,identifier_type}'
                                ), '') IS NOT NULL
                                 AND NULLIF(btrim(
                                    row.mapped_data #>> '{sku,identifier}'
                                ), '') IS NOT NULL
                                THEN concat_ws(':',
                                    upper(btrim(
                                        row.mapped_data #>> '{sku,identifier_type}'
                                    )),
                                    upper(btrim(
                                        row.mapped_data #>> '{sku,identifier_namespace}'
                                    )),
                                    upper(btrim(row.mapped_data #>> '{sku,identifier}'))
                                )
                            END
                        ) AS sku_key,
                        COALESCE(
                            NULLIF(btrim(row.mapped_data #>> '{price_record,channel_id}'), ''),
                            batch.channel_id
                        ) AS channel_id,
                        COALESCE(
                            row.mapped_data #>> '{price_record,location_id}', ''
                        ) AS location_id,
                        COALESCE(
                            row.mapped_data #>> '{price_record,customer_segment_id}', ''
                        ) AS segment_id,
                        row.mapped_data #>> '{price_record,effective_at}' AS effective_at,
                        row.mapped_data #>> '{price_record,price_minor}' AS price_minor,
                        upper(row.mapped_data #>> '{price_record,currency}') AS currency
                    FROM data_pipeline.import_row AS row
                    JOIN data_pipeline.import_batch AS batch
                      ON batch.org_id = row.org_id AND batch.id = row.batch_id
                    WHERE row.batch_id = %s
                      AND row.row_status <> 'excluded'
                      AND row.mapped_data ? 'price_record'
                ),
                conflicting_keys AS (
                    SELECT sku_key, channel_id, location_id, segment_id, effective_at
                    FROM candidates
                    WHERE NULLIF(sku_key, '') IS NOT NULL
                      AND NULLIF(channel_id, '') IS NOT NULL
                      AND NULLIF(effective_at, '') IS NOT NULL
                      AND NULLIF(price_minor, '') IS NOT NULL
                    GROUP BY sku_key, channel_id, location_id, segment_id, effective_at
                    HAVING count(DISTINCT (price_minor, currency)) > 1
                )
                INSERT INTO data_pipeline.validation_event (
                    org_id, batch_id, row_id, severity, code, message,
                    field, raw_value, suggested_fix
                )
                SELECT
                    %s,
                    %s,
                    candidate.id,
                    'error',
                    'duplicate_sku_channel_in_batch',
                    format(
                        'Row %%s: this SKU/channel/location/segment/effective date '
                        'has conflicting prices.',
                        candidate.row_number
                    ),
                    'price_record.price_minor',
                    candidate.price_minor,
                    'Keep one price for this effective key or make the dimensions/dates distinct.'
                FROM candidates AS candidate
                JOIN conflicting_keys AS conflict
                  ON conflict.sku_key = candidate.sku_key
                 AND conflict.channel_id = candidate.channel_id
                 AND conflict.location_id = candidate.location_id
                 AND conflict.segment_id = candidate.segment_id
                 AND conflict.effective_at = candidate.effective_at
                """,
                (operation.batch_id, operation.org_id, operation.batch_id),
            )
            connection.execute(
                """
                UPDATE data_pipeline.import_row AS row
                SET row_status = CASE
                        WHEN EXISTS (
                            SELECT 1 FROM data_pipeline.validation_event AS event
                            WHERE event.row_id = row.id AND event.severity = 'error'
                        ) THEN 'errored'
                        ELSE 'validated'
                    END,
                    updated_at = clock_timestamp()
                WHERE row.batch_id = %s AND row.row_status <> 'excluded'
                """,
                (operation.batch_id,),
            )
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
            batch_updated = connection.execute(
                """
                UPDATE data_pipeline.import_batch
                SET status = 'validated', failed_reason = NULL, updated_at = clock_timestamp()
                WHERE id = %s AND status IN ('mapped', 'validated')
                """,
                (operation.batch_id,),
            )
            if batch_updated.rowcount != 1:
                raise RuntimeError("Import batch was not ready for validation")
            counts = self._row_counts(connection, operation.batch_id)
        return counts

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

    def fail_operation(
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
                if operation.operation_type == "parse_profile":
                    connection.execute(
                        """
                        UPDATE data_pipeline.import_batch
                        SET status = 'failed', failed_reason = %s, updated_at = clock_timestamp()
                        WHERE id = %s
                        """,
                        (error_message, operation.batch_id),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE data_pipeline.import_batch
                        SET failed_reason = %s, updated_at = clock_timestamp()
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
                if operation.operation_type == "parse_profile":
                    connection.execute(
                        """
                        UPDATE data_pipeline.import_batch
                        SET status = 'uploaded',
                            failed_reason = NULL,
                            updated_at = clock_timestamp()
                        WHERE id = %s
                        """,
                        (operation.batch_id,),
                    )
            if updated.rowcount != 1:
                raise RuntimeError("Import operation lease was lost")
