from __future__ import annotations

import socket
import subprocess
import time
import unittest
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from importlib import import_module
from io import BytesIO
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from uuid import UUID, uuid4

import grpc
import jwt
import psycopg
from openpyxl import Workbook
from psycopg.types.json import Jsonb
from services.catalog.v1 import catalog_pb2
from services.data_pipeline.v1 import data_pipeline_pb2, data_pipeline_pb2_grpc

from owomide_data_pipeline.catalog import CatalogSnapshot, ChannelReference
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
CHANNEL_ID = "00000000-0000-0000-0000-000000000201"


class FakeCatalogClient:
    def __init__(self, reject_sku_codes: set[str] | None = None) -> None:
        self.write_requests: list[dict[str, object]] = []
        self.reject_sku_codes = reject_sku_codes or set()

    def load_snapshot(self, _org_id: str, _sku_ids) -> CatalogSnapshot:
        channel = ChannelReference(CHANNEL_ID, "RETAIL", "NGN")
        return CatalogSnapshot(
            channels_by_id={CHANNEL_ID: channel},
            channels_by_code={"RETAIL": channel},
            location_ids=frozenset(),
            segment_ids=frozenset(),
            sku_ids=frozenset(),
            costs={},
        )

    def upsert_canonical(
        self,
        *,
        org_id: str,
        batch_id: str,
        actor_id: str,
        chunk_index: int,
        rows,
    ) -> catalog_pb2.UpsertCanonicalResponse:
        rows = list(rows)
        self.write_requests.append(
            {
                "org_id": org_id,
                "batch_id": batch_id,
                "actor_id": actor_id,
                "chunk_index": chunk_index,
                "rows": rows,
            }
        )
        results = [
            catalog_pb2.CanonicalRowResult(
                source_item_ref=row.source_item_ref,
                status=(
                    catalog_pb2.WRITE_STATUS_REJECTED
                    if row.new_sku.sku_code in self.reject_sku_codes
                    else catalog_pb2.WRITE_STATUS_CREATED
                ),
                sku_id=f"sku-{index}",
                errors=(
                    [
                        catalog_pb2.CatalogWriteError(
                            code=catalog_pb2.CATALOG_ERROR_CODE_IDENTIFIER_CONFLICT,
                            message="SKU identifier conflicts with an existing SKU",
                            field="new_sku.identifiers",
                        )
                    ]
                    if row.new_sku.sku_code in self.reject_sku_codes
                    else []
                ),
            )
            for index, row in enumerate(rows)
        ]
        rejected = sum(result.status == catalog_pb2.WRITE_STATUS_REJECTED for result in results)
        return catalog_pb2.UpsertCanonicalResponse(
            operation_id=f"catalog-{chunk_index}",
            results=results,
            summary={"created": len(rows) - rejected, "rejected": rejected},
        )


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
                "0005_mapping_operations.up.sql",
                "0006_validation_operations.up.sql",
                "0007_canonical_commit_outbox.up.sql",
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
    def _process_one(cls, catalog_client: FakeCatalogClient | None = None) -> FakeCatalogClient:
        catalog = catalog_client or FakeCatalogClient()
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
            catalog_client=catalog,
        )
        if not processor.process_once():
            raise AssertionError("Expected the worker to claim an import operation")
        return catalog

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

    def test_mapping_template_is_snapshotted_and_applied_asynchronously(self) -> None:
        upload = self._upload(
            "mapped-prices.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            (
                b"SKU,Selling Price,Unused\n"
                b"0012,10.50,preserved only in raw\n"
                b"0013,20.00,excluded but remapped\n"
            ),
        )
        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            connection.execute(
                "UPDATE data_pipeline.import_row "
                "SET row_status = 'excluded', excluded_reason = 'out of scope' "
                "WHERE batch_id = %s AND row_number = 3",
                (upload.batch_id,),
            )
            connection.execute(
                "INSERT INTO data_pipeline.validation_event "
                "(org_id, batch_id, severity, code, message) "
                "VALUES ('org-a', %s, 'warning', 'stale', 'must be invalidated by remapping')",
                (upload.batch_id,),
            )

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            saved = stub.SaveMappingTemplate(
                data_pipeline_pb2.SaveMappingTemplateRequest(
                    name="ERP prices",
                    source_system="erp",
                    mappings_json=(
                        '{"SKU":"sku.sku_code","Selling Price":"price_record.price_minor"}'
                    ),
                    transformation_rules_json=(
                        '[{"field":"Selling Price","type":"decimal_to_minor_units","scale":2}]'
                    ),
                ),
                metadata=self._metadata(),
            )
            listed = stub.ListMappingTemplates(
                data_pipeline_pb2.ListMappingTemplatesRequest(source_system="erp"),
                metadata=self._metadata(),
            )
            self.assertEqual([item.id for item in listed.templates], [saved.template.id])

            queued = stub.ApplyMapping(
                data_pipeline_pb2.ApplyMappingRequest(
                    batch_id=upload.batch_id,
                    template_id=saved.template.id,
                ),
                metadata=self._metadata(),
            )
            self.assertEqual(queued.status, data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED)

            # Editing the template after queueing must not alter the operation's retry snapshot.
            stub.SaveMappingTemplate(
                data_pipeline_pb2.SaveMappingTemplateRequest(
                    id=saved.template.id,
                    name="ERP prices",
                    source_system="erp",
                    mappings_json='{"SKU":"sku.sku_code"}',
                    transformation_rules_json="[]",
                ),
                metadata=self._metadata(),
            )
            with self.assertRaises(grpc.RpcError) as hidden:
                stub.ApplyMapping(
                    data_pipeline_pb2.ApplyMappingRequest(
                        batch_id=upload.batch_id,
                        template_id=saved.template.id,
                    ),
                    metadata=self._metadata("org-b"),
                )
            self.assertEqual(hidden.exception.code(), grpc.StatusCode.NOT_FOUND)

        self._process_one()

        with psycopg.connect(self.admin_url) as connection:
            rows = connection.execute(
                "SELECT raw_data, mapped_data, row_status, excluded_reason "
                "FROM data_pipeline.import_row "
                "WHERE batch_id = %s ORDER BY row_number",
                (upload.batch_id,),
            ).fetchall()
            batch = connection.execute(
                "SELECT status, template_id FROM data_pipeline.import_batch WHERE id = %s",
                (upload.batch_id,),
            ).fetchone()
            operation = connection.execute(
                "SELECT status, progress_current, progress_total, request_payload "
                "FROM data_pipeline.import_operation WHERE id = %s",
                (queued.operation_id,),
            ).fetchone()
            validation_count = connection.execute(
                "SELECT count(*) FROM data_pipeline.validation_event WHERE batch_id = %s",
                (upload.batch_id,),
            ).fetchone()[0]

        self.assertEqual(rows[0][0]["Unused"], "preserved only in raw")
        self.assertEqual(
            rows[0][1],
            {
                "sku": {"sku_code": "0012"},
                "price_record": {"price_minor": "10.50"},
            },
        )
        self.assertEqual(rows[0][2:], ("mapped", None))
        self.assertEqual(rows[1][1]["sku"]["sku_code"], "0013")
        self.assertEqual(rows[1][2:], ("excluded", "out of scope"))
        self.assertEqual(batch, ("mapped", UUID(saved.template.id)))
        self.assertEqual(operation[:3], ("succeeded", 2, 2))
        self.assertEqual(validation_count, 0)
        self.assertEqual(
            operation[3]["mappings"]["Selling Price"],
            "price_record.price_minor",
        )
        self.assertEqual(
            operation[3]["transformation_rules"][0]["type"],
            "decimal_to_minor_units",
        )

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            with self.assertRaises(grpc.RpcError) as invalid:
                stub.ApplyMapping(
                    data_pipeline_pb2.ApplyMappingRequest(
                        batch_id=upload.batch_id,
                        mappings_json='{"Missing":"sku.sku_code"}',
                    ),
                    metadata=self._metadata(),
                )
            self.assertEqual(invalid.exception.code(), grpc.StatusCode.INVALID_ARGUMENT)

        # Mapping completion automatically queues validation; consume it so this test owns
        # every operation it creates and cannot affect later cases.
        self._process_one()

    def test_mapping_validation_report_and_exclusion_revalidation(self) -> None:
        upload = self._upload(
            "validated-prices.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            (
                b"SKU,Price,Currency,Effective,Channel,Cost,Cost Currency,Cost Effective\n"
                b"A-1,10.00,NGN,2026-07-12,retail,8.00,NGN,2026-07-12\n"
                b"a-1,11.00,NGN,2026-07-12,retail,8.00,NGN,2026-07-12\n"
                b"A-2,7.00,NGN,2026-07-12,retail,8.00,NGN,2026-07-12\n"
                b"A-3,12.00,NGN,2026-07-12,retail,8.00,NGN,2026-07-12\n"
            ),
        )
        self._process_one()

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            stub.ApplyMapping(
                data_pipeline_pb2.ApplyMappingRequest(
                    batch_id=upload.batch_id,
                    mappings_json=(
                        '{"SKU":"sku.sku_code","Price":"price_record.price_minor",'
                        '"Currency":"price_record.currency",'
                        '"Effective":"price_record.effective_at",'
                        '"Channel":"channel.code","Cost":"cost_record.cost_minor",'
                        '"Cost Currency":"cost_record.currency",'
                        '"Cost Effective":"cost_record.effective_at"}'
                    ),
                    transformation_rules_json=(
                        '[{"field":"Price","type":"decimal_to_minor_units","scale":2},'
                        '{"field":"Cost","type":"decimal_to_minor_units","scale":2}]'
                    ),
                ),
                metadata=self._metadata(),
            )

        self._process_one()
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            pending = stub.GetValidationReport(
                data_pipeline_pb2.GetValidationReportRequest(batch_id=upload.batch_id),
                metadata=self._metadata(),
            )
            self.assertTrue(pending.HasField("operation"))
            self.assertEqual(
                pending.operation.status,
                data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED,
            )

        self._process_one()
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            report = stub.GetValidationReport(
                data_pipeline_pb2.GetValidationReportRequest(batch_id=upload.batch_id),
                metadata=self._metadata(),
            )
            self.assertFalse(report.HasField("operation"))
            self.assertEqual(
                (report.row_counts.ok, report.row_counts.errored),
                (1, 3),
            )
            self.assertEqual(
                [event.code for event in report.events].count("duplicate_sku_channel_in_batch"),
                2,
            )
            self.assertIn("below_cost", {event.code for event in report.events})

        with psycopg.connect(self.admin_url) as connection:
            excluded_row_id = connection.execute(
                "SELECT id FROM data_pipeline.import_row WHERE batch_id = %s AND row_number = 2",
                (upload.batch_id,),
            ).fetchone()[0]
            transformed = connection.execute(
                "SELECT mapped_data FROM data_pipeline.import_row "
                "WHERE batch_id = %s AND row_number = 5",
                (upload.batch_id,),
            ).fetchone()[0]
        self.assertEqual(transformed["price_record"]["price_minor"], 1200)
        self.assertEqual(transformed["price_record"]["channel_id"], CHANNEL_ID)

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            excluded = stub.ExcludeRow(
                data_pipeline_pb2.ExcludeRowRequest(
                    batch_id=upload.batch_id,
                    row_id=str(excluded_row_id),
                    reason="duplicate source row",
                ),
                metadata=self._metadata(),
            )
            self.assertEqual(
                excluded.row.status,
                data_pipeline_pb2.IMPORT_ROW_STATUS_EXCLUDED,
            )
            self.assertEqual(
                excluded.operation.status,
                data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED,
            )

        self._process_one()
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            report = stub.GetValidationReport(
                data_pipeline_pb2.GetValidationReportRequest(batch_id=upload.batch_id),
                metadata=self._metadata(),
            )
        self.assertEqual(
            (
                report.row_counts.ok,
                report.row_counts.warned,
                report.row_counts.excluded,
                report.row_counts.errored,
            ),
            (2, 0, 1, 1),
        )
        self.assertNotIn(
            "duplicate_sku_channel_in_batch",
            {event.code for event in report.events},
        )

    def test_validated_rows_commit_to_catalog_and_create_transactional_event(self) -> None:
        upload = self._upload(
            "commit-prices.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            (
                b"SKU,Price,Currency,Effective,Channel,Cost,Cost Currency,Cost Effective\n"
                b"A-100,12.00,NGN,2026-07-12,retail,8.00,NGN,2026-07-12\n"
            ),
        )
        catalog = FakeCatalogClient()
        self._process_one(catalog)
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            stub.ApplyMapping(
                data_pipeline_pb2.ApplyMappingRequest(
                    batch_id=upload.batch_id,
                    mappings_json=(
                        '{"SKU":"sku.sku_code","Price":"price_record.price_minor",'
                        '"Currency":"price_record.currency",'
                        '"Effective":"price_record.effective_at",'
                        '"Channel":"channel.code","Cost":"cost_record.cost_minor",'
                        '"Cost Currency":"cost_record.currency",'
                        '"Cost Effective":"cost_record.effective_at"}'
                    ),
                    transformation_rules_json=(
                        '[{"field":"Price","type":"decimal_to_minor_units","scale":2},'
                        '{"field":"Cost","type":"decimal_to_minor_units","scale":2}]'
                    ),
                ),
                metadata=self._metadata(),
            )
        self._process_one(catalog)
        self._process_one(catalog)

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            queued = stub.CommitBatch(
                data_pipeline_pb2.CommitBatchRequest(
                    batch_id=upload.batch_id,
                    confirm_warnings=False,
                ),
                metadata=self._metadata(),
            )
            self.assertEqual(
                queued.operation.status,
                data_pipeline_pb2.IMPORT_OPERATION_STATUS_QUEUED,
            )

        self._process_one(catalog)
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            completed = stub.GetImportOperation(
                data_pipeline_pb2.GetImportOperationRequest(operation_id=queued.operation.id),
                metadata=self._metadata(),
            ).operation

        self.assertEqual(completed.status, data_pipeline_pb2.IMPORT_OPERATION_STATUS_SUCCEEDED)
        self.assertEqual(completed.commit_result.row_counts.ok, 1)
        self.assertEqual(completed.commit_result.catalog_summary.created, 1)
        self.assertEqual(completed.commit_result.catalog_operation_ids, ["catalog-0"])
        self.assertEqual(len(catalog.write_requests), 1)
        write = catalog.write_requests[0]
        self.assertEqual(write["chunk_index"], 0)
        self.assertEqual(write["actor_id"], "user-a")
        self.assertEqual(write["rows"][0].prices[0].price.amount, 1200)

        with psycopg.connect(self.admin_url) as connection:
            batch_state = connection.execute(
                "SELECT status, committed_at FROM data_pipeline.import_batch WHERE id = %s",
                (upload.batch_id,),
            ).fetchone()
            row_state = connection.execute(
                "SELECT row_status FROM data_pipeline.import_row WHERE batch_id = %s",
                (upload.batch_id,),
            ).fetchone()[0]
            event = connection.execute(
                "SELECT id, partition_key, payload FROM data_pipeline.outbox_event "
                "WHERE aggregate_id = %s",
                (upload.batch_id,),
            ).fetchone()
        self.assertEqual(batch_state[0], "committed")
        self.assertIsNotNone(batch_state[1])
        self.assertEqual(row_state, "committed")
        self.assertEqual(event[1], upload.batch_id)
        event_message = import_module("events.import.v1_pb2").ImportCommitted()
        event_message.ParseFromString(bytes(event[2]))
        self.assertEqual(event_message.batch_id, upload.batch_id)
        self.assertEqual(event_message.row_counts.ok, 1)
        self.assertEqual(event_message.actor_id, "user-a")

    def test_commit_freezes_and_writes_stable_catalog_chunks_of_at_most_500(self) -> None:
        batch_id = uuid4()
        with psycopg.connect(self.admin_url) as connection:
            connection.execute(
                """
                INSERT INTO data_pipeline.import_batch (
                    id, org_id, owner_id, source_file_url, source_filename,
                    source_type, source_sha256, status
                ) VALUES (%s, 'org-a', 'user-a', 's3://imports/chunked.csv',
                          'chunked.csv', 'csv', %s, 'validated')
                """,
                (batch_id, "f" * 64),
            )
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO data_pipeline.import_row (
                        org_id, batch_id, row_number, raw_data, mapped_data, row_status
                    ) VALUES ('org-a', %s, %s, '{}', %s, 'validated')
                    """,
                    [
                        (
                            batch_id,
                            index,
                            Jsonb(
                                {
                                    "sku": {"sku_code": f"SKU-{index:04d}"},
                                    "price_record": {
                                        "channel_id": CHANNEL_ID,
                                        "price_minor": 1000 + index,
                                        "currency": "NGN",
                                        "effective_at": "2026-07-12T00:00:00Z",
                                    },
                                }
                            ),
                        )
                        for index in range(1, 502)
                    ],
                )

        repository = ImportRepository(Database(self.service_url, statement_timeout_ms=15_000))
        operation = repository.queue_commit(
            org_id="org-a",
            batch_id=batch_id,
            confirm_warnings=False,
        )
        catalog = self._process_one(FakeCatalogClient())

        self.assertEqual(
            [(write["chunk_index"], len(write["rows"])) for write in catalog.write_requests],
            [(0, 500), (1, 1)],
        )
        completed = repository.get_operation("org-a", operation.id)
        self.assertEqual(completed.status, "succeeded")
        self.assertEqual(completed.progress_current, 501)
        self.assertEqual(
            completed.result_payload["catalog_operation_ids"],
            ["catalog-0", "catalog-1"],
        )

    def test_warned_rows_require_explicit_confirmation_before_commit(self) -> None:
        upload = self._upload(
            "warned-prices.csv",
            data_pipeline_pb2.IMPORT_SOURCE_TYPE_CSV,
            b"SKU,Price,Currency,Effective,Channel\nA-1,12.00,NGN,2026-07-12,retail\n",
        )
        catalog = FakeCatalogClient()
        self._process_one(catalog)
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            stub.ApplyMapping(
                data_pipeline_pb2.ApplyMappingRequest(
                    batch_id=upload.batch_id,
                    mappings_json=(
                        '{"SKU":"sku.sku_code","Price":"price_record.price_minor",'
                        '"Currency":"price_record.currency",'
                        '"Effective":"price_record.effective_at","Channel":"channel.code"}'
                    ),
                    transformation_rules_json=(
                        '[{"field":"Price","type":"decimal_to_minor_units","scale":2}]'
                    ),
                ),
                metadata=self._metadata(),
            )
        self._process_one(catalog)
        self._process_one(catalog)

        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            with self.assertRaises(grpc.RpcError) as rejected:
                stub.CommitBatch(
                    data_pipeline_pb2.CommitBatchRequest(
                        batch_id=upload.batch_id,
                        confirm_warnings=False,
                    ),
                    metadata=self._metadata(),
                )
            self.assertEqual(rejected.exception.code(), grpc.StatusCode.FAILED_PRECONDITION)
            queued = stub.CommitBatch(
                data_pipeline_pb2.CommitBatchRequest(
                    batch_id=upload.batch_id,
                    confirm_warnings=True,
                ),
                metadata=self._metadata(),
            )
        self.assertEqual(queued.operation.progress_total, 1)
        self._process_one(catalog)
        completed = ImportRepository(
            Database(self.service_url, statement_timeout_ms=15_000)
        ).get_operation("org-a", UUID(queued.operation.id))
        self.assertEqual(completed.result_payload["row_counts"]["warned"], 1)

    def test_catalog_rejection_errors_only_the_rejected_row_and_commits_the_rest(self) -> None:
        batch_id = uuid4()
        with psycopg.connect(self.admin_url) as connection:
            connection.execute(
                """
                INSERT INTO data_pipeline.import_batch (
                    id, org_id, owner_id, source_file_url, source_filename,
                    source_type, source_sha256, status
                ) VALUES (%s, 'org-a', 'user-a', 's3://imports/partial.csv',
                          'partial.csv', 'csv', %s, 'validated')
                """,
                (batch_id, "e" * 64),
            )
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO data_pipeline.import_row (
                        org_id, batch_id, row_number, raw_data, mapped_data, row_status
                    ) VALUES ('org-a', %s, %s, '{}', %s, 'validated')
                    """,
                    [
                        (
                            batch_id,
                            index,
                            Jsonb(
                                {
                                    "sku": {"sku_code": sku_code},
                                    "price_record": {
                                        "channel_id": CHANNEL_ID,
                                        "price_minor": 1000,
                                        "currency": "NGN",
                                        "effective_at": "2026-07-12T00:00:00Z",
                                    },
                                }
                            ),
                        )
                        for index, sku_code in enumerate(("SKU-GOOD", "SKU-CONFLICT"), 1)
                    ],
                )
        repository = ImportRepository(Database(self.service_url, statement_timeout_ms=15_000))
        operation = repository.queue_commit(
            org_id="org-a", batch_id=batch_id, confirm_warnings=False
        )
        self._process_one(FakeCatalogClient({"SKU-CONFLICT"}))

        completed = repository.get_operation("org-a", operation.id)
        self.assertEqual(completed.result_payload["catalog_summary"]["created"], 1)
        self.assertEqual(completed.result_payload["catalog_summary"]["rejected"], 1)
        self.assertEqual(completed.result_payload["row_counts"]["errored"], 1)
        with psycopg.connect(self.admin_url) as connection:
            states = connection.execute(
                "SELECT mapped_data #>> '{sku,sku_code}', row_status "
                "FROM data_pipeline.import_row WHERE batch_id = %s ORDER BY row_number",
                (batch_id,),
            ).fetchall()
            finding = connection.execute(
                "SELECT code, field, suggested_fix FROM data_pipeline.validation_event "
                "WHERE batch_id = %s",
                (batch_id,),
            ).fetchone()
        self.assertEqual(states, [("SKU-GOOD", "committed"), ("SKU-CONFLICT", "errored")])
        self.assertEqual(finding[0], "identifier_conflict")
        self.assertEqual(finding[1], "new_sku.identifiers")
        self.assertTrue(finding[2])


if __name__ == "__main__":
    unittest.main()
