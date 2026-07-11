from __future__ import annotations

import socket
import subprocess
import time
import unittest
from pathlib import Path
from uuid import uuid4

import psycopg

from owomide_data_pipeline.db import Database

POSTGRES_IMAGE = "postgres:16-alpine"
ADMIN_PASSWORD = "data_pipeline_admin_test"
SERVICE_PASSWORD = "data_pipeline_service_test"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class MigrationIntegrationTest(unittest.TestCase):
    container_name: str
    admin_url: str
    service_url: str

    @classmethod
    def setUpClass(cls) -> None:
        port = free_port()
        cls.container_name = f"owomide-data-pipeline-test-{uuid4().hex[:10]}"
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                cls.container_name,
                "--env",
                f"POSTGRES_PASSWORD={ADMIN_PASSWORD}",
                "--publish",
                f"127.0.0.1:{port}:5432",
                POSTGRES_IMAGE,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        cls.admin_url = f"postgresql://postgres:{ADMIN_PASSWORD}@127.0.0.1:{port}/postgres"
        cls.service_url = (
            f"postgresql://data_pipeline_svc:{SERVICE_PASSWORD}@127.0.0.1:{port}/postgres"
        )
        cls._wait_for_postgres()
        cls._apply_migration()

    @classmethod
    def tearDownClass(cls) -> None:
        subprocess.run(
            ["docker", "rm", "--force", cls.container_name],
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

    @classmethod
    def _migration_path(cls, filename: str) -> Path:
        return Path(__file__).resolve().parents[1] / "migrations" / filename

    @classmethod
    def _apply_migration(cls) -> None:
        up_sql = cls._migration_path("0001_create_schema.up.sql").read_text()
        with psycopg.connect(cls.admin_url, autocommit=True) as connection:
            connection.execute("CREATE SCHEMA data_pipeline")
            connection.execute(f"CREATE ROLE data_pipeline_svc LOGIN PASSWORD '{SERVICE_PASSWORD}'")
            connection.execute("GRANT USAGE ON SCHEMA data_pipeline TO data_pipeline_svc")
            connection.execute(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA data_pipeline "
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO data_pipeline_svc"
            )
            connection.execute(up_sql)

    def test_schema_has_all_six_tables(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            rows = connection.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'data_pipeline' ORDER BY table_name"
            ).fetchall()
        self.assertEqual(
            [row[0] for row in rows],
            [
                "column_profile",
                "import_batch",
                "import_operation",
                "import_row",
                "mapping_template",
                "validation_event",
            ],
        )

    def test_rls_fails_closed_and_isolates_tenants(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            template_id = connection.execute(
                "INSERT INTO data_pipeline.mapping_template "
                "(org_id, name, mappings, created_by) "
                "VALUES ('org-a', 'ERP', '{}', 'user-a') RETURNING id"
            ).fetchone()[0]

        with psycopg.connect(self.service_url) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM data_pipeline.mapping_template"
                ).fetchone()[0],
                0,
            )
            connection.execute("SELECT set_config('app.org_id', 'org-a', false)")
            self.assertEqual(
                connection.execute(
                    "SELECT id FROM data_pipeline.mapping_template WHERE name = 'ERP'"
                ).fetchone()[0],
                template_id,
            )
            connection.execute("SELECT set_config('app.org_id', 'org-b', false)")
            self.assertIsNone(
                connection.execute("SELECT id FROM data_pipeline.mapping_template").fetchone()
            )
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                connection.execute(
                    "INSERT INTO data_pipeline.mapping_template "
                    "(org_id, name, mappings, created_by) "
                    "VALUES ('org-a', 'Spoofed', '{}', 'user-b')"
                )
            connection.rollback()

    def test_database_helper_sets_transaction_local_tenant(self) -> None:
        database = Database(self.service_url, statement_timeout_ms=1_000)
        with database.transaction("org-a") as connection:
            connection.execute(
                "INSERT INTO data_pipeline.mapping_template "
                "(org_id, name, mappings, created_by) "
                "VALUES ('org-a', 'Helper', '{}', 'user-a')"
            )
            count = connection.execute(
                "SELECT count(*) FROM data_pipeline.mapping_template WHERE name = 'Helper'"
            ).fetchone()["count"]
        self.assertEqual(count, 1)

    def test_raw_rows_and_source_metadata_are_immutable(self) -> None:
        database = Database(self.service_url, statement_timeout_ms=1_000)
        with database.transaction("org-a") as connection:
            batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, source_sha256) "
                "VALUES ('org-a', 'user-a', 's3://imports/raw.csv', 'raw.csv', 'csv', %s) "
                "RETURNING id",
                ("1" * 64,),
            ).fetchone()["id"]
            row_id = connection.execute(
                "INSERT INTO data_pipeline.import_row "
                "(org_id, batch_id, row_number, raw_data) "
                "VALUES ('org-a', %s, 1, '{\"sku\":\"A-1\"}') RETURNING id",
                (batch_id,),
            ).fetchone()["id"]
            connection.execute(
                'UPDATE data_pipeline.import_row SET mapped_data = \'{"sku_code":"A-1"}\' '
                "WHERE id = %s",
                (row_id,),
            )

        with (
            self.assertRaises(psycopg.errors.RaiseException),
            database.transaction("org-a") as connection,
        ):
            connection.execute(
                'UPDATE data_pipeline.import_row SET raw_data = \'{"sku":"changed"}\' '
                "WHERE id = %s",
                (row_id,),
            )
        with (
            self.assertRaises(psycopg.errors.RaiseException),
            database.transaction("org-a") as connection,
        ):
            connection.execute("DELETE FROM data_pipeline.import_batch WHERE id = %s", (batch_id,))

    def test_composite_foreign_keys_reject_cross_tenant_rows(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, source_sha256) "
                "VALUES ('org-a', 'user-a', 's3://imports/a.csv', 'a.csv', 'csv', %s) "
                "RETURNING id",
                ("0" * 64,),
            ).fetchone()[0]
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                connection.execute(
                    "INSERT INTO data_pipeline.import_row "
                    "(org_id, batch_id, row_number, raw_data) VALUES ('org-b', %s, 1, '{}')",
                    (batch_id,),
                )
            connection.rollback()

    def test_z_down_migration_removes_owned_tables(self) -> None:
        down_sql = self._migration_path("0001_create_schema.down.sql").read_text()
        with psycopg.connect(self.admin_url, autocommit=True) as connection:
            connection.execute(down_sql)
            count = connection.execute(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'data_pipeline'"
            ).fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
