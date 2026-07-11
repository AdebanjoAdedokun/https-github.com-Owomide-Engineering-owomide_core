from __future__ import annotations

import hashlib
import unittest
from datetime import UTC, datetime
from uuid import uuid4

import grpc
import jwt
from services.data_pipeline.v1 import data_pipeline_pb2

from owomide_data_pipeline.auth import ServiceAuthenticator
from owomide_data_pipeline.repository import ImportBatchRecord
from owomide_data_pipeline.service import DataPipelineService
from owomide_data_pipeline.storage import StoredObject

SECRET = "data-pipeline-test-secret-that-is-at-least-32-chars"


class RpcAbort(Exception):
    def __init__(self, code: grpc.StatusCode, details: str) -> None:
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self) -> None:
        now = datetime.now(UTC)
        token = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "gateway_svc",
                "aud": "data-pipeline",
                "iat": now,
                "exp": now.timestamp() + 120,
            },
            SECRET,
            algorithm="HS256",
        )
        self._metadata = (
            ("authorization", f"Bearer {token}"),
            ("x-org-id", "org-a"),
            ("x-user-id", "user-a"),
        )

    def invocation_metadata(self):
        return self._metadata

    def abort(self, code: grpc.StatusCode, details: str):
        raise RpcAbort(code, details)


class FakeObjectStore:
    def __init__(self) -> None:
        self.payload = b""
        self.object_name = ""
        self.deleted: list[str] = []

    def put_stream(self, object_name, stream, _content_type):
        self.object_name = object_name
        self.payload = stream.read()
        return StoredObject(url=f"s3://imports/{object_name}", etag="etag")

    def delete(self, object_url: str) -> None:
        self.deleted.append(object_url)


class FakeRepository:
    def __init__(self) -> None:
        self.created: dict | None = None
        self.batch: ImportBatchRecord | None = None

    def create_import(self, **values):
        self.created = values
        return values["batch_id"], values["operation_id"]

    def get_batch(self, org_id, _batch_id):
        self.requested_org_id = org_id
        return self.batch


def service(repository: FakeRepository, object_store: FakeObjectStore, max_bytes: int = 100):
    return DataPipelineService(
        repository=repository,  # type: ignore[arg-type]
        object_store=object_store,  # type: ignore[arg-type]
        authenticator=ServiceAuthenticator(
            issuer="owomide-internal",
            audience="data-pipeline",
            secrets={"gateway_svc": SECRET},
        ),
        upload_max_bytes=max_bytes,
    )


class DataPipelineServiceTest(unittest.TestCase):
    def test_upload_streams_file_and_records_trusted_tenant_context(self) -> None:
        repository = FakeRepository()
        object_store = FakeObjectStore()
        requests = iter(
            (
                data_pipeline_pb2.UploadImportFileRequest(
                    metadata=data_pipeline_pb2.UploadImportFileMetadata(
                        source_filename="prices.csv",
                        source_type=data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
                        source_system="erp",
                    )
                ),
                data_pipeline_pb2.UploadImportFileRequest(chunk=b"SKU,Price\n"),
                data_pipeline_pb2.UploadImportFileRequest(chunk=b"A-1,100\n"),
            )
        )

        response = service(repository, object_store).UploadImportFile(requests, FakeContext())

        expected = b"SKU,Price\nA-1,100\n"
        self.assertEqual(object_store.payload, expected)
        self.assertIn("imports/org-a/", object_store.object_name)
        self.assertEqual(repository.created["org_id"], "org-a")
        self.assertEqual(repository.created["owner_id"], "user-a")
        self.assertEqual(repository.created["source_sha256"], hashlib.sha256(expected).hexdigest())
        self.assertEqual(response.status, data_pipeline_pb2.IMPORT_BATCH_STATUS_UPLOADED)

    def test_upload_limit_is_reported_without_creating_a_batch(self) -> None:
        repository = FakeRepository()
        object_store = FakeObjectStore()
        requests = iter(
            (
                data_pipeline_pb2.UploadImportFileRequest(
                    metadata=data_pipeline_pb2.UploadImportFileMetadata(
                        source_filename="prices.csv",
                        source_type=data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
                    )
                ),
                data_pipeline_pb2.UploadImportFileRequest(chunk=b"too-large"),
            )
        )

        with self.assertRaises(RpcAbort) as error:
            service(repository, object_store, max_bytes=3).UploadImportFile(requests, FakeContext())

        self.assertEqual(error.exception.code, grpc.StatusCode.RESOURCE_EXHAUSTED)
        self.assertIsNone(repository.created)

    def test_batch_response_omits_absent_optional_values(self) -> None:
        repository = FakeRepository()
        object_store = FakeObjectStore()
        now = datetime.now(UTC)
        batch_id = uuid4()
        repository.batch = ImportBatchRecord(
            id=batch_id,
            org_id="org-a",
            owner_id="user-a",
            source_file_url="s3://imports/prices.csv",
            source_filename="prices.csv",
            source_type="csv",
            source_sha256="a" * 64,
            status="uploaded",
            source_system=None,
            channel_id=None,
            customer_segment_id=None,
            template_id=None,
            failed_reason=None,
            created_at=now,
            updated_at=now,
            committed_at=None,
        )

        response = service(repository, object_store).GetImportBatch(
            data_pipeline_pb2.GetImportBatchRequest(batch_id=str(batch_id)),
            FakeContext(),
        )

        self.assertEqual(response.batch.id, str(batch_id))
        self.assertFalse(response.batch.HasField("source_system"))
        self.assertFalse(response.batch.HasField("committed_at"))


if __name__ == "__main__":
    unittest.main()
