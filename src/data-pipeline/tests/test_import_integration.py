from __future__ import annotations

import socket
import subprocess
import time
import unittest
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

import grpc
import jwt
import psycopg
from openpyxl import Workbook
from services.data_pipeline.v1 import data_pipeline_pb2, data_pipeline_pb2_grpc

from owomide_data_pipeline.config import Config
from owomide_data_pipeline.db import Database
from owomide_data_pipeline.processor import ImportProcessor
from owomide_data_pipeline.repository import ImportRepository
from owomide_data_pipeline.server import Runtime, start_server
from owomide_data_pipeline.storage import ObjectStore

POSTGRES_IMAGE = "postgres:16-alpine"
MINIO_IMAGE = "minio/minio:latest"
ADMIN_PASSWORD = "import_admin_test"
SERVICE_PASSWORD = "import_service_test"
MINIO_USER = "minioadmin"
MINIO_PASSWORD = "minioadmin"
SERVICE_SECRET = "data-pipeline-integration-secret-at-least-32-chars"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class ImportIntegrationTest(unittest.TestCase):
    postgres_name: str
    minio_name: str
    admin_url: str
    service_url: str
    runtime: Runtime
    config: Config
    object_store: ObjectStore

    @classmethod
    def setUpClass(cls) -> None:
        postgres_port = free_port()
        minio_port = free_port()
        cls.postgres_name = f"owomide-import-pg-{uuid4().hex[:10]}"
        cls.minio_name = f"owomide-import-minio-{uuid4().hex[:10]}"
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                cls.postgres_name,
                "--env",
                f"POSTGRES_PASSWORD={ADMIN_PASSWORD}",
                "--publish",
                f"127.0.0.1:{postgres_port}:5432",
                POSTGRES_IMAGE,
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                cls.minio_name,
                "--env",
                f"MINIO_ROOT_USER={MINIO_USER}",
                "--env",
                f"MINIO_ROOT_PASSWORD={MINIO_PASSWORD}",
                "--publish",
                f"127.0.0.1:{minio_port}:9000",
                MINIO_IMAGE,
                "minio",
                "server",
                "/data",
            ],
            check=True,
            capture_output=True,
        )
        cls.admin_url = f"postgresql://postgres:{ADMIN_PASSWORD}@127.0.0.1:{postgres_port}/postgres"
        cls.service_url = (
            f"postgresql://data_pipeline_svc:{SERVICE_PASSWORD}@127.0.0.1:{postgres_port}/postgres"
        )
        cls._wait_for_postgres()
        cls._wait_for_minio(minio_port)
        cls._apply_migrations()

        base = Config.from_env(
            {
                "DATA_PIPELINE_SERVICE_SECRETS_JSON": (f'{{"gateway_svc":"{SERVICE_SECRET}"}}'),
            }
        )
        cls.config = replace(
            base,
            database_url=cls.service_url,
            grpc_host="127.0.0.1",
            grpc_port=free_port(),
            health_host="127.0.0.1",
            health_port=free_port(),
            object_store_endpoint=f"127.0.0.1:{minio_port}",
            object_store_access_key=MINIO_USER,
            object_store_secret_key=MINIO_PASSWORD,
            object_store_bucket="integration-imports",
        )
        cls.object_store = ObjectStore(
            endpoint=cls.config.object_store_endpoint,
            access_key=cls.config.object_store_access_key,
            secret_key=cls.config.object_store_secret_key,
            secure=False,
            bucket=cls.config.object_store_bucket,
        )
        cls.runtime = start_server(cls.config)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.runtime.stop(grace_seconds=0)
        for name in (cls.postgres_name, cls.minio_name):
            subprocess.run(
                ["docker", "rm", "--force", name],
                check=False,
                capture_output=True,
            )

    @classmethod
    def _wait_for_postgres(cls) -> None:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                with psycopg.connect(cls.admin_url):
                    return
            except psycopg.OperationalError:
                time.sleep(0.25)
        raise RuntimeError("PostgreSQL test container did not become ready")

    @staticmethod
    def _wait_for_minio(port: int) -> None:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                with urlopen(f"http://127.0.0.1:{port}/minio/health/live") as response:
                    if response.status == 200:
                        return
            except URLError:
                time.sleep(0.25)
        raise RuntimeError("MinIO test container did not become ready")

    @classmethod
    def _migration_path(cls, filename: str) -> Path:
        return Path(__file__).resolve().parents[1] / "migrations" / filename

    @classmethod
    def _apply_migrations(cls) -> None:
        with psycopg.connect(cls.admin_url, autocommit=True) as connection:
            connection.execute("CREATE SCHEMA data_pipeline")
            connection.execute(f"CREATE ROLE data_pipeline_svc LOGIN PASSWORD '{SERVICE_PASSWORD}'")
            connection.execute("GRANT USAGE ON SCHEMA data_pipeline TO data_pipeline_svc")
            connection.execute(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA data_pipeline "
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO data_pipeline_svc"
            )
            for filename in (
                "0001_create_schema.up.sql",
                "0002_data_pipeline_foundation.up.sql",
                "0003_claim_import_operations.up.sql",
                "0004_column_profile_ordinal_position.up.sql",
            ):
                connection.execute(cls._migration_path(filename).read_text())

    @staticmethod
    def _metadata(org_id: str = "org-a") -> tuple[tuple[str, str], ...]:
        now = datetime.now(UTC)
        encoded = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "gateway_svc",
                "aud": "data-pipeline",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            SERVICE_SECRET,
            algorithm="HS256",
        )
        return (
            ("authorization", f"Bearer {encoded}"),
            ("x-org-id", org_id),
            ("x-user-id", "user-a"),
        )

    @classmethod
    def _upload(cls, filename: str, source_type: int, payload: bytes):
        def requests():
            yield data_pipeline_pb2.UploadImportFileRequest(
                metadata=data_pipeline_pb2.UploadImportFileMetadata(
                    source_filename=filename,
                    source_type=source_type,
                )
            )
            midpoint = max(1, len(payload) // 2)
            yield data_pipeline_pb2.UploadImportFileRequest(chunk=payload[:midpoint])
            yield data_pipeline_pb2.UploadImportFileRequest(chunk=payload[midpoint:])

        with grpc.insecure_channel(f"127.0.0.1:{cls.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            return stub.UploadImportFile(requests(), metadata=cls._metadata())

    @classmethod
    def _process_one(cls) -> None:
        processor = ImportProcessor(
            repository=ImportRepository(Database(cls.service_url, statement_timeout_ms=15_000)),
            object_store=cls.object_store,
            worker_id=f"integration-{uuid4().hex[:8]}",
            lease_seconds=60,
            retry_base_seconds=1,
            max_rows=100,
            max_columns=20,
            insert_batch_size=2,
            xlsx_spool_memory_bytes=1024 * 1024,
        )
        if not processor.process_once():
            raise AssertionError("Expected the worker to claim an import operation")

    def test_csv_upload_is_durable_parsed_and_profiled_asynchronously(self) -> None:
        response = self._upload(
            "prices.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            (
                b"SKU,Selling Price,Currency,Effective Date\n"
                b'A-1,"NGN 1,000.00",NGN,2026-01-31\n'
                b"A-2,NGN 250.00,NGN,2026-02-15\n"
            ),
        )

        with psycopg.connect(self.admin_url) as connection:
            batch = connection.execute(
                "SELECT source_file_url, source_sha256, status FROM data_pipeline.import_batch "
                "WHERE id = %s",
                (response.batch_id,),
            ).fetchone()
        self.assertTrue(batch[0].startswith("s3://integration-imports/imports/org-a/"))
        self.assertEqual(len(batch[1]), 64)
        self.assertEqual(batch[2], "uploaded")
        with self.object_store.open(batch[0]) as stored:
            self.assertIn(b"NGN 1,000.00", stored.read())

        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            rows = connection.execute(
                "SELECT row_number, raw_data FROM data_pipeline.import_row "
                "WHERE batch_id = %s ORDER BY row_number",
                (response.batch_id,),
            ).fetchall()
            operation = connection.execute(
                "SELECT status, progress_current, progress_total "
                "FROM data_pipeline.import_operation WHERE id = %s",
                (response.operation_id,),
            ).fetchone()
            batch_status = connection.execute(
                "SELECT status FROM data_pipeline.import_batch WHERE id = %s",
                (response.batch_id,),
            ).fetchone()[0]
            profiles = connection.execute(
                "SELECT column_name, ordinal_position, detected_type, currency_hint, date_hint, "
                "suggested_mapping, confidence::text FROM data_pipeline.column_profile "
                "WHERE batch_id = %s ORDER BY ordinal_position",
                (response.batch_id,),
            ).fetchall()
        self.assertEqual(
            rows,
            [
                (
                    2,
                    {
                        "SKU": "A-1",
                        "Selling Price": "NGN 1,000.00",
                        "Currency": "NGN",
                        "Effective Date": "2026-01-31",
                    },
                ),
                (
                    3,
                    {
                        "SKU": "A-2",
                        "Selling Price": "NGN 250.00",
                        "Currency": "NGN",
                        "Effective Date": "2026-02-15",
                    },
                ),
            ],
        )
        self.assertEqual(operation, ("succeeded", 2, 2))
        self.assertEqual(batch_status, "profiled")
        self.assertEqual(
            profiles,
            [
                ("SKU", 1, "string", None, None, "sku.sku_code", "0.9800"),
                (
                    "Selling Price",
                    2,
                    "decimal",
                    "NGN",
                    None,
                    "price_record.price_minor",
                    "0.9800",
                ),
                (
                    "Currency",
                    3,
                    "string",
                    "NGN",
                    None,
                    "price_record.currency",
                    "0.9800",
                ),
                (
                    "Effective Date",
                    4,
                    "date",
                    None,
                    "YYYY-MM-DD",
                    "price_record.effective_at",
                    "0.9800",
                ),
            ],
        )

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            profile_response = stub.GetColumnProfile(
                data_pipeline_pb2.GetColumnProfileRequest(batch_id=response.batch_id),
                metadata=self._metadata(),
            )
            self.assertEqual(
                [column.ordinal_position for column in profile_response.columns],
                [1, 2, 3, 4],
            )
            self.assertFalse(profile_response.HasField("operation"))
            with self.assertRaises(grpc.RpcError) as hidden:
                stub.GetColumnProfile(
                    data_pipeline_pb2.GetColumnProfileRequest(batch_id=response.batch_id),
                    metadata=self._metadata("org-b"),
                )
            self.assertEqual(hidden.exception.code(), grpc.StatusCode.NOT_FOUND)

    def test_xlsx_upload_uses_read_only_parser_and_preserves_formula(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["SKU", "Formula"])
        sheet.append(["A-3", "=1+2"])
        payload = BytesIO()
        workbook.save(payload)
        workbook.close()

        response = self._upload(
            "prices.xlsx",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_XLSX,
            payload.getvalue(),
        )
        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            raw_data = connection.execute(
                "SELECT raw_data FROM data_pipeline.import_row WHERE batch_id = %s",
                (response.batch_id,),
            ).fetchone()[0]
        self.assertEqual(raw_data, {"SKU": "A-3", "Formula": "=1+2"})

    def test_invalid_file_fails_without_retry_and_keeps_source_object(self) -> None:
        response = self._upload(
            "duplicate.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            b"SKU, SKU\nA-1,A-2\n",
        )
        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            state = connection.execute(
                "SELECT operation.status, operation.attempt_count, batch.status, "
                "batch.failed_reason, batch.source_file_url "
                "FROM data_pipeline.import_operation AS operation "
                "JOIN data_pipeline.import_batch AS batch ON batch.id = operation.batch_id "
                "WHERE operation.id = %s",
                (response.operation_id,),
            ).fetchone()
        self.assertEqual(state[:3], ("failed", 1, "failed"))
        self.assertIn("duplicate column", state[3])
        with self.object_store.open(state[4]) as source:
            self.assertEqual(source.read(), b"SKU, SKU\nA-1,A-2\n")

    def test_header_only_file_fails_with_actionable_reason(self) -> None:
        response = self._upload(
            "header-only.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            b"SKU,Price\n",
        )

        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            state = connection.execute(
                "SELECT operation.status, batch.status, batch.failed_reason "
                "FROM data_pipeline.import_operation AS operation "
                "JOIN data_pipeline.import_batch AS batch ON batch.id = operation.batch_id "
                "WHERE operation.id = %s",
                (response.operation_id,),
            ).fetchone()
        self.assertEqual(state[:2], ("failed", "failed"))
        self.assertIn("does not contain any data rows", state[2])


if __name__ == "__main__":
    unittest.main()
