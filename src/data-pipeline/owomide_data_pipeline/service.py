from __future__ import annotations

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
from owomide_data_pipeline.errors import InvalidImportError, UploadTooLargeError
from owomide_data_pipeline.repository import (
    ColumnProfileRecord,
    ImportBatchRecord,
    ImportOperationRecord,
    ImportRepository,
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
    return data_pipeline_pb2.ImportOperation(
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


def _uuid(raw: str, field: str, context: grpc.ServicerContext) -> UUID:
    try:
        return UUID(raw)
    except ValueError:
        context.abort(grpc.StatusCode.INVALID_ARGUMENT, f"{field} is invalid")


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
