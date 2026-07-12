from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from datetime import datetime
from pathlib import PurePath
from urllib.parse import quote
from uuid import UUID, uuid4

import grpc
from google.protobuf.timestamp_pb2 import Timestamp
from minio.error import S3Error
from services.data_pipeline.v1 import data_pipeline_pb2, data_pipeline_pb2_grpc

from owomide_data_pipeline.auth import AuthenticationError, ServiceAuthenticator
from owomide_data_pipeline.errors import (
    ImportConflictError,
    ImportResourceNotFoundError,
    ImportStateError,
    InvalidImportError,
    UploadTooLargeError,
)
from owomide_data_pipeline.mapping import (
    deterministic_json,
    parse_mappings_json,
    parse_transformation_rules_json,
    validate_mappings,
    validate_transformation_rules,
)
from owomide_data_pipeline.repository import (
    ColumnProfileRecord,
    CommitResultRecord,
    ImportBatchRecord,
    ImportOperationRecord,
    ImportRepository,
    ImportRowRecord,
    MappingTemplateRecord,
    RowCountsRecord,
    ValidationEventRecord,
    commit_result,
)
from owomide_data_pipeline.storage import ObjectStore
from owomide_data_pipeline.streaming import LimitedHashingReader

SOURCE_TYPE_TO_DB = {
    data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV: "csv",
    data_pipeline_pb2.IMPORT_SOURCE_TYPE_XLSX: "xlsx",
}
SOURCE_TYPE_FROM_DB = {value: key for key, value in SOURCE_TYPE_TO_DB.items()}
BATCH_STATUS_FROM_DB = {
    "uploaded": data_pipeline_pb2.IMPORT_BATCH_STATUS_UPLOADED,
    "parsing": data_pipeline_pb2.IMPORT_BATCH_STATUS_PARSING,
    "profiled": data_pipeline_pb2.IMPORT_BATCH_STATUS_PROFILED,
    "mapped": data_pipeline_pb2.IMPORT_BATCH_STATUS_MAPPED,
    "validated": data_pipeline_pb2.IMPORT_BATCH_STATUS_VALIDATED,
    "committing": data_pipeline_pb2.IMPORT_BATCH_STATUS_COMMITTING,
    "committed": data_pipeline_pb2.IMPORT_BATCH_STATUS_COMMITTED,
    "failed": data_pipeline_pb2.IMPORT_BATCH_STATUS_FAILED,
    "discarded": data_pipeline_pb2.IMPORT_BATCH_STATUS_DISCARDED,
}
BATCH_STATUS_TO_DB = {value: key for key, value in BATCH_STATUS_FROM_DB.items()}
OPERATION_TYPE_FROM_DB = {
    "parse_profile": data_pipeline_pb2.IMPORT_OPERATION_TYPE_PARSE_PROFILE,
    "apply_mapping": data_pipeline_pb2.IMPORT_OPERATION_TYPE_APPLY_MAPPING,
    "validate": data_pipeline_pb2.IMPORT_OPERATION_TYPE_VALIDATE,
    "commit": data_pipeline_pb2.IMPORT_OPERATION_TYPE_COMMIT,
}
OPERATION_STATUS_FROM_DB = {
    "queued": data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED,
    "running": data_pipeline_pb2.IMPORT_OPERATION_STATUS_RUNNING,
    "succeeded": data_pipeline_pb2.IMPORT_OPERATION_STATUS_SUCCEEDED,
    "failed": data_pipeline_pb2.IMPORT_OPERATION_STATUS_FAILED,
    "cancelled": data_pipeline_pb2.IMPORT_OPERATION_STATUS_CANCELLED,
}
ROW_STATUS_FROM_DB = {
    "pending": data_pipeline_pb2.IMPORT_ROW_STATUS_PENDING,
    "mapped": data_pipeline_pb2.IMPORT_ROW_STATUS_MAPPED,
    "validated": data_pipeline_pb2.IMPORT_ROW_STATUS_VALIDATED,
    "committed": data_pipeline_pb2.IMPORT_ROW_STATUS_COMMITTED,
    "excluded": data_pipeline_pb2.IMPORT_ROW_STATUS_EXCLUDED,
    "errored": data_pipeline_pb2.IMPORT_ROW_STATUS_ERRORED,
}
VALIDATION_SEVERITY_FROM_DB = {
    "error": data_pipeline_pb2.VALIDATION_SEVERITY_ERROR,
    "warning": data_pipeline_pb2.VALIDATION_SEVERITY_WARNING,
    "info": data_pipeline_pb2.VALIDATION_SEVERITY_INFO,
}


def _timestamp(value: datetime | None) -> Timestamp | None:
    if value is None:
        return None
    result = Timestamp()
    result.FromDatetime(value)
    return result


def _batch_message(record: ImportBatchRecord) -> data_pipeline_pb2.ImportBatch:
    return data_pipeline_pb2.ImportBatch(
        id=str(record.id),
        org_id=record.org_id,
        owner_id=record.owner_id,
        source_file_url=record.source_file_url,
        source_filename=record.source_filename,
        source_type=SOURCE_TYPE_FROM_DB[record.source_type],
        source_sha256=record.source_sha256,
        status=BATCH_STATUS_FROM_DB[record.status],
        source_system=record.source_system,
        channel_id=record.channel_id,
        customer_segment_id=record.customer_segment_id,
        template_id=str(record.template_id) if record.template_id else None,
        created_at=_timestamp(record.created_at),
        updated_at=_timestamp(record.updated_at),
        committed_at=_timestamp(record.committed_at),
        failed_reason=record.failed_reason,
    )


def _operation_message(record: ImportOperationRecord) -> data_pipeline_pb2.ImportOperation:
    result = data_pipeline_pb2.ImportOperation(
        id=str(record.id),
        org_id=record.org_id,
        batch_id=str(record.batch_id),
        operation_type=OPERATION_TYPE_FROM_DB[record.operation_type],
        status=OPERATION_STATUS_FROM_DB[record.status],
        attempt_count=record.attempt_count,
        max_attempts=record.max_attempts,
        progress_current=record.progress_current,
        progress_total=record.progress_total,
        error_message=record.error_message,
        next_attempt_at=_timestamp(record.next_attempt_at),
        created_at=_timestamp(record.created_at),
        started_at=_timestamp(record.started_at),
        finished_at=_timestamp(record.finished_at),
    )
    completed = commit_result(record)
    if completed is not None:
        result.commit_result.CopyFrom(_commit_result_message(completed))
    return result


def _column_profile_message(record: ColumnProfileRecord) -> data_pipeline_pb2.ColumnProfile:
    return data_pipeline_pb2.ColumnProfile(
        id=str(record.id),
        org_id=record.org_id,
        batch_id=str(record.batch_id),
        column_name=record.column_name,
        ordinal_position=record.ordinal_position,
        detected_type=record.detected_type,
        sample_values=record.sample_values,
        currency_hint=record.currency_hint,
        date_hint=record.date_hint,
        suggested_mapping=record.suggested_mapping,
        confidence=float(record.confidence),
    )


def _mapping_template_message(
    record: MappingTemplateRecord,
) -> data_pipeline_pb2.MappingTemplate:
    return data_pipeline_pb2.MappingTemplate(
        id=str(record.id),
        org_id=record.org_id,
        name=record.name,
        source_system=record.source_system,
        channel_id=record.channel_id,
        customer_segment_id=record.customer_segment_id,
        mappings_json=deterministic_json(record.mappings),
        transformation_rules_json=deterministic_json(record.transformation_rules),
        created_by=record.created_by,
        created_at=_timestamp(record.created_at),
        updated_at=_timestamp(record.updated_at),
    )


def _row_message(record: ImportRowRecord) -> data_pipeline_pb2.ImportRow:
    return data_pipeline_pb2.ImportRow(
        id=str(record.id),
        org_id=record.org_id,
        batch_id=str(record.batch_id),
        row_number=record.row_number,
        raw_data_json=deterministic_json(record.raw_data),
        mapped_data_json=deterministic_json(record.mapped_data)
        if record.mapped_data is not None
        else None,
        status=ROW_STATUS_FROM_DB[record.row_status],
        excluded_reason=record.excluded_reason,
    )


def _validation_event_message(
    record: ValidationEventRecord,
) -> data_pipeline_pb2.ValidationEvent:
    return data_pipeline_pb2.ValidationEvent(
        id=str(record.id),
        org_id=record.org_id,
        batch_id=str(record.batch_id),
        row_id=str(record.row_id) if record.row_id else None,
        severity=VALIDATION_SEVERITY_FROM_DB[record.severity],
        code=record.code,
        message=record.message,
        field=record.field,
        raw_value=record.raw_value,
        suggested_fix=record.suggested_fix,
        created_at=_timestamp(record.created_at),
    )


def _row_counts_message(record: RowCountsRecord) -> data_pipeline_pb2.RowCounts:
    return data_pipeline_pb2.RowCounts(
        ok=record.ok,
        warned=record.warned,
        excluded=record.excluded,
        errored=record.errored,
    )


def _commit_result_message(record: CommitResultRecord) -> data_pipeline_pb2.CommitResult:
    return data_pipeline_pb2.CommitResult(
        row_counts=_row_counts_message(record.row_counts),
        catalog_operation_ids=record.catalog_operation_ids,
        catalog_replayed=record.catalog_replayed,
        catalog_summary=data_pipeline_pb2.CatalogWriteSummary(
            created=record.catalog_summary.created,
            updated=record.catalog_summary.updated,
            unchanged=record.catalog_summary.unchanged,
            rejected=record.catalog_summary.rejected,
        ),
    )


def _mapped_data(raw: str) -> dict[str, object]:
    if not raw or len(raw.encode("utf-8")) > 1_000_000:
        raise InvalidImportError("mapped_data_json must be a JSON object under 1000000 bytes")

    def object_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise InvalidImportError(f'mapped_data_json contains duplicate key "{key}"')
            result[key] = value
        return result

    def invalid_constant(constant: str) -> None:
        raise InvalidImportError(f'mapped_data_json contains non-standard number "{constant}"')

    try:
        value = json.loads(
            raw,
            object_pairs_hook=object_pairs,
            parse_constant=invalid_constant,
        )
    except json.JSONDecodeError as exc:
        raise InvalidImportError("mapped_data_json must be valid JSON") from exc
    if not isinstance(value, dict):
        raise InvalidImportError("mapped_data_json must contain a JSON object")
    return value


def _uuid(raw: str, field: str, context: grpc.ServicerContext) -> UUID:
    try:
        return UUID(raw)
    except ValueError:
        context.abort(grpc.StatusCode.INVALID_ARGUMENT, f"{field} is invalid")


def _optional_text(raw: str, field: str, context: grpc.ServicerContext) -> str | None:
    value = raw.strip()
    if len(value) > 255:
        context.abort(grpc.StatusCode.INVALID_ARGUMENT, f"{field} is too long")
    return value or None


def _filename(raw: str) -> str:
    value = raw.strip()
    if (
        not value
        or len(value.encode("utf-8")) > 255
        or PurePath(value).name != value
        or "/" in value
        or "\\" in value
        or any(ord(character) < 32 for character in value)
    ):
        raise InvalidImportError("source_filename is invalid")
    return value


class DataPipelineService(data_pipeline_pb2_grpc.DataPipelineServiceServicer):
    def __init__(
        self,
        *,
        repository: ImportRepository,
        object_store: ObjectStore,
        authenticator: ServiceAuthenticator,
        upload_max_bytes: int,
    ) -> None:
        self._repository = repository
        self._object_store = object_store
        self._authenticator = authenticator
        self._upload_max_bytes = upload_max_bytes

    def _request_context(self, context: grpc.ServicerContext):
        try:
            return self._authenticator.authenticate(context.invocation_metadata())
        except AuthenticationError:
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid internal service credential")

    def _delete_safely(self, object_url: str | None) -> None:
        if object_url is None:
            return
        try:
            self._object_store.delete(object_url)
        except (OSError, S3Error):
            logging.exception("Could not remove orphaned import object")

    def UploadImportFile(self, request_iterator, context):
        request_context = self._request_context(context)
        try:
            first = next(request_iterator)
        except StopIteration:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Upload metadata is required")
        if first.WhichOneof("payload") != "metadata":
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Upload metadata must be first")

        metadata = first.metadata
        source_type = SOURCE_TYPE_TO_DB.get(metadata.source_type)
        if source_type is None:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "source_type is invalid")

        try:
            filename = _filename(metadata.source_filename)
            if PurePath(filename).suffix.lower() != f".{source_type}":
                raise InvalidImportError("Filename extension does not match source_type")
        except InvalidImportError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))

        batch_id = uuid4()
        operation_id = uuid4()
        object_name = "/".join(
            (
                "imports",
                quote(request_context.org_id, safe=""),
                str(batch_id),
                quote(filename, safe=""),
            )
        )
        reader = LimitedHashingReader(self._chunks(request_iterator), self._upload_max_bytes)
        object_url: str | None = None
        try:
            content_type = (
                "text/csv"
                if source_type == "csv"
                else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            stored = self._object_store.put_stream(
                object_name,
                reader,
                content_type,
            )
            object_url = stored.url
            if reader.size == 0:
                raise InvalidImportError("Import file is empty")
            self._repository.create_import(
                batch_id=batch_id,
                operation_id=operation_id,
                org_id=request_context.org_id,
                owner_id=request_context.user_id,
                source_file_url=stored.url,
                source_filename=filename,
                source_type=source_type,
                source_sha256=reader.sha256,
                source_system=metadata.source_system or None,
                channel_id=metadata.channel_id or None,
                customer_segment_id=metadata.customer_segment_id or None,
            )
        except UploadTooLargeError as exc:
            self._delete_safely(object_url)
            context.abort(grpc.StatusCode.RESOURCE_EXHAUSTED, str(exc))
        except InvalidImportError as exc:
            self._delete_safely(object_url)
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except (OSError, S3Error):
            context.abort(grpc.StatusCode.UNAVAILABLE, "Object storage is unavailable")
        except Exception:
            self._delete_safely(object_url)
            raise

        return data_pipeline_pb2.UploadImportFileResponse(
            batch_id=str(batch_id),
            operation_id=str(operation_id),
            status=data_pipeline_pb2.IMPORT_BATCH_STATUS_UPLOADED,
        )

    @staticmethod
    def _chunks(request_iterator) -> Iterator[bytes]:
        for request in request_iterator:
            if request.WhichOneof("payload") != "chunk":
                raise InvalidImportError("Upload metadata may only be sent once")
            yield bytes(request.chunk)

    def GetImportBatch(self, request, context):
        request_context = self._request_context(context)
        record = self._repository.get_batch(
            request_context.org_id,
            _uuid(request.batch_id, "batch_id", context),
        )
        if record is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "Import batch not found")
        return data_pipeline_pb2.GetImportBatchResponse(batch=_batch_message(record))

    def ListImportBatches(self, request, context):
        request_context = self._request_context(context)
        status = None
        if request.status != data_pipeline_pb2.IMPORT_BATCH_STATUS_UNSPECIFIED:
            status = BATCH_STATUS_TO_DB.get(request.status)
            if status is None:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "status is invalid")
        try:
            result = self._repository.list_batches(
                org_id=request_context.org_id,
                status=status,
                page_size=request.pagination.page_size,
                page_token=request.pagination.page_token,
            )
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        return data_pipeline_pb2.ListImportBatchesResponse(
            batches=[_batch_message(batch) for batch in result.batches],
            pagination={
                "next_page_token": result.next_page_token,
                "total_count": result.total_count,
            },
        )

    def GetImportOperation(self, request, context):
        request_context = self._request_context(context)
        record = self._repository.get_operation(
            request_context.org_id,
            _uuid(request.operation_id, "operation_id", context),
        )
        if record is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "Import operation not found")
        return data_pipeline_pb2.GetImportOperationResponse(operation=_operation_message(record))

    def GetColumnProfile(self, request, context):
        request_context = self._request_context(context)
        state = self._repository.get_column_profile_state(
            request_context.org_id,
            _uuid(request.batch_id, "batch_id", context),
        )
        if state is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "Import batch not found")
        response = data_pipeline_pb2.GetColumnProfileResponse(
            columns=[_column_profile_message(column) for column in state.columns]
        )
        if state.operation is not None and state.operation.status != "succeeded":
            response.operation.CopyFrom(_operation_message(state.operation))
        return response

    def ApplyMapping(self, request, context):
        request_context = self._request_context(context)
        has_template = request.HasField("template_id")
        has_inline_mapping = request.HasField("mappings_json")
        if has_template == has_inline_mapping:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "Provide exactly one of template_id or mappings_json",
            )

        try:
            batch_id = _uuid(request.batch_id, "batch_id", context)
            template = None
            if has_template:
                if request.HasField("transformation_rules_json"):
                    raise InvalidImportError(
                        "transformation_rules_json cannot override a saved template"
                    )
                template = self._repository.get_mapping_template(
                    request_context.org_id,
                    _uuid(request.template_id, "template_id", context),
                )
                if template is None:
                    raise ImportResourceNotFoundError("Mapping template not found")
                mappings = validate_mappings(template.mappings)
                transformation_rules = validate_transformation_rules(
                    list(template.transformation_rules),
                    mappings,
                )
            else:
                mappings = parse_mappings_json(request.mappings_json)
                transformation_rules = parse_transformation_rules_json(
                    request.transformation_rules_json
                    if request.HasField("transformation_rules_json")
                    else "[]",
                    mappings,
                )

            operation_id = self._repository.queue_mapping(
                org_id=request_context.org_id,
                batch_id=batch_id,
                mappings=mappings,
                transformation_rules=transformation_rules,
                template=template,
            )
        except InvalidImportError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ImportResourceNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        except ImportStateError as exc:
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, str(exc))
        except ImportConflictError as exc:
            context.abort(grpc.StatusCode.ALREADY_EXISTS, str(exc))

        return data_pipeline_pb2.ApplyMappingResponse(
            batch_id=str(batch_id),
            operation_id=str(operation_id),
            status=data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED,
        )

    def GetValidationReport(self, request, context):
        request_context = self._request_context(context)
        try:
            state = self._repository.get_validation_report(
                org_id=request_context.org_id,
                batch_id=_uuid(request.batch_id, "batch_id", context),
                page_size=request.pagination.page_size,
                page_token=request.pagination.page_token,
            )
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        if state is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "Import batch not found")
        response = data_pipeline_pb2.GetValidationReportResponse(
            batch_id=request.batch_id,
            row_counts=_row_counts_message(state.row_counts),
            events=[_validation_event_message(event) for event in state.events],
            pagination={
                "next_page_token": state.next_page_token,
                "total_count": state.total_count,
            },
        )
        if state.operation is not None and state.operation.status != "succeeded":
            response.operation.CopyFrom(_operation_message(state.operation))
        return response

    def EditRow(self, request, context):
        request_context = self._request_context(context)
        try:
            row, operation = self._repository.edit_row(
                org_id=request_context.org_id,
                batch_id=_uuid(request.batch_id, "batch_id", context),
                row_id=_uuid(request.row_id, "row_id", context),
                mapped_data=_mapped_data(request.mapped_data_json),
            )
        except InvalidImportError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ImportResourceNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        except ImportStateError as exc:
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, str(exc))
        except ImportConflictError as exc:
            context.abort(grpc.StatusCode.ALREADY_EXISTS, str(exc))
        return data_pipeline_pb2.EditRowResponse(
            row=_row_message(row),
            operation=_operation_message(operation),
        )

    def ExcludeRow(self, request, context):
        request_context = self._request_context(context)
        reason = request.reason.strip()
        if not reason or len(reason) > 500:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "reason must be between 1 and 500 characters",
            )
        try:
            row, operation = self._repository.exclude_row(
                org_id=request_context.org_id,
                batch_id=_uuid(request.batch_id, "batch_id", context),
                row_id=_uuid(request.row_id, "row_id", context),
                reason=reason,
            )
        except ImportResourceNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        except ImportStateError as exc:
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, str(exc))
        except ImportConflictError as exc:
            context.abort(grpc.StatusCode.ALREADY_EXISTS, str(exc))
        return data_pipeline_pb2.ExcludeRowResponse(
            row=_row_message(row),
            operation=_operation_message(operation),
        )

    def CommitBatch(self, request, context):
        request_context = self._request_context(context)
        try:
            operation = self._repository.queue_commit(
                org_id=request_context.org_id,
                batch_id=_uuid(request.batch_id, "batch_id", context),
                confirm_warnings=request.confirm_warnings,
            )
        except ImportResourceNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        except ImportStateError as exc:
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, str(exc))
        except ImportConflictError as exc:
            context.abort(grpc.StatusCode.ALREADY_EXISTS, str(exc))
        response = data_pipeline_pb2.CommitBatchResponse(
            batch_id=request.batch_id,
            operation=_operation_message(operation),
        )
        completed = commit_result(operation)
        if completed is not None:
            response.row_counts.CopyFrom(_row_counts_message(completed.row_counts))
            response.catalog_operation_id = (
                completed.catalog_operation_ids[0] if completed.catalog_operation_ids else ""
            )
            response.catalog_replayed = completed.catalog_replayed
            response.catalog_summary.CopyFrom(
                data_pipeline_pb2.CatalogWriteSummary(
                    created=completed.catalog_summary.created,
                    updated=completed.catalog_summary.updated,
                    unchanged=completed.catalog_summary.unchanged,
                    rejected=completed.catalog_summary.rejected,
                )
            )
        return response

    def ListMappingTemplates(self, request, context):
        request_context = self._request_context(context)
        try:
            result = self._repository.list_mapping_templates(
                org_id=request_context.org_id,
                source_system=_optional_text(request.source_system, "source_system", context)
                if request.HasField("source_system")
                else None,
                channel_id=_optional_text(request.channel_id, "channel_id", context)
                if request.HasField("channel_id")
                else None,
                customer_segment_id=_optional_text(
                    request.customer_segment_id,
                    "customer_segment_id",
                    context,
                )
                if request.HasField("customer_segment_id")
                else None,
                page_size=request.pagination.page_size,
                page_token=request.pagination.page_token,
            )
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        return data_pipeline_pb2.ListMappingTemplatesResponse(
            templates=[_mapping_template_message(template) for template in result.templates],
            pagination={
                "next_page_token": result.next_page_token,
                "total_count": result.total_count,
            },
        )

    def SaveMappingTemplate(self, request, context):
        request_context = self._request_context(context)
        name = request.name.strip()
        if not name or len(name) > 200:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "name must be between 1 and 200 characters",
            )
        try:
            mappings = parse_mappings_json(request.mappings_json)
            transformation_rules = parse_transformation_rules_json(
                request.transformation_rules_json,
                mappings,
            )
            record = self._repository.save_mapping_template(
                org_id=request_context.org_id,
                user_id=request_context.user_id,
                template_id=_uuid(request.id, "id", context) if request.HasField("id") else None,
                name=name,
                source_system=_optional_text(request.source_system, "source_system", context)
                if request.HasField("source_system")
                else None,
                channel_id=_optional_text(request.channel_id, "channel_id", context)
                if request.HasField("channel_id")
                else None,
                customer_segment_id=_optional_text(
                    request.customer_segment_id,
                    "customer_segment_id",
                    context,
                )
                if request.HasField("customer_segment_id")
                else None,
                mappings=mappings,
                transformation_rules=transformation_rules,
            )
        except InvalidImportError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ImportResourceNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        except ImportConflictError as exc:
            context.abort(grpc.StatusCode.ALREADY_EXISTS, str(exc))
        return data_pipeline_pb2.SaveMappingTemplateResponse(
            template=_mapping_template_message(record)
        )
