from __future__ import annotations

import socket
import subprocess
import time
import unittest
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import psycopg

from owomide_data_pipeline.db import Database
from owomide_data_pipeline.intelligence.fx import (
    FxCalculator,
    FxConflictError,
    FxRateNotFoundError,
)
from owomide_data_pipeline.intelligence.repository import FxRateRepository

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
    legacy_unprofiled_batch_id: str
    legacy_profiled_batch_id: str

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
            ):
                connection.execute(cls._migration_path(filename).read_text())
            cls.legacy_unprofiled_batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, "
                "source_sha256, status) "
                "VALUES ('org-legacy', 'user-a', 's3://imports/legacy.csv', 'legacy.csv', "
                "'csv', %s, 'parsing') RETURNING id",
                ("b" * 64,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO data_pipeline.import_operation "
                "(org_id, batch_id, operation_type, status, attempt_count, max_attempts, "
                "progress_current, progress_total, finished_at) "
                "VALUES ('org-legacy', %s, 'parse_profile', 'succeeded', 5, 5, 1, 1, now())",
                (cls.legacy_unprofiled_batch_id,),
            )
            cls.legacy_profiled_batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, "
                "source_sha256, status) "
                "VALUES ('org-profiled', 'user-a', 's3://imports/profiled.csv', "
                "'profiled.csv', 'csv', %s, 'parsing') RETURNING id",
                ("c" * 64,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO data_pipeline.import_operation "
                "(org_id, batch_id, operation_type, status, progress_current, progress_total, "
                "finished_at) "
                "VALUES ('org-profiled', %s, 'parse_profile', 'succeeded', 1, 1, now())",
                (cls.legacy_profiled_batch_id,),
            )
            connection.execute(
                "INSERT INTO data_pipeline.column_profile "
                "(org_id, batch_id, column_name, detected_type) VALUES "
                "('org-profiled', %s, 'SKU', 'string'), "
                "('org-profiled', %s, 'Price', 'decimal')",
                (cls.legacy_profiled_batch_id, cls.legacy_profiled_batch_id),
            )
            connection.execute(
                cls._migration_path("0004_column_profile_ordinal_position.up.sql").read_text()
            )
            connection.execute(cls._migration_path("0005_mapping_operations.up.sql").read_text())
            connection.execute(cls._migration_path("0006_validation_operations.up.sql").read_text())
            connection.execute(
                cls._migration_path("0007_canonical_commit_outbox.up.sql").read_text()
            )
            connection.execute(cls._migration_path("0008_fx_rate_snapshots.up.sql").read_text())
            # Keep the recovered fixture from competing with operations created by claim tests.
            connection.execute(
                "UPDATE data_pipeline.import_operation "
                "SET next_attempt_at = now() + interval '1 day' WHERE batch_id = %s",
                (cls.legacy_unprofiled_batch_id,),
            )

    def test_schema_has_all_pipeline_tables(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            rows = connection.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'data_pipeline' ORDER BY table_name"
            ).fetchall()
        self.assertEqual(
            [row[0] for row in rows],
            [
                "column_profile",
                "commit_item",
                "fx_rate_entry",
                "fx_rate_snapshot",
                "import_batch",
                "import_operation",
                "import_row",
                "mapping_template",
                "outbox_event",
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

    def test_worker_claim_function_leases_across_rls_without_table_bypass(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, source_sha256) "
                "VALUES ('org-worker', 'user-a', 's3://imports/a.csv', 'a.csv', 'csv', %s) "
                "RETURNING id",
                ("a" * 64,),
            ).fetchone()[0]
            operation_id = connection.execute(
                "INSERT INTO data_pipeline.import_operation "
                "(org_id, batch_id, operation_type) "
                "VALUES ('org-worker', %s, 'parse_profile') RETURNING id",
                (batch_id,),
            ).fetchone()[0]

        with psycopg.connect(self.service_url) as connection:
            claimed = connection.execute(
                "SELECT * FROM data_pipeline.claim_parse_operation('worker-test', 60)"
            ).fetchone()
            self.assertEqual(claimed[0], operation_id)
            self.assertEqual(claimed[1], "org-worker")
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM data_pipeline.import_operation"
                ).fetchone()[0],
                0,
            )

        with psycopg.connect(self.admin_url) as connection:
            state = connection.execute(
                "SELECT status, attempt_count, locked_by FROM data_pipeline.import_operation "
                "WHERE id = %s",
                (operation_id,),
            ).fetchone()
        self.assertEqual(state, ("running", 1, "worker-test"))

    def test_profile_migration_backfills_order_and_recovers_f2_2_batches(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            profiles = connection.execute(
                "SELECT column_name, ordinal_position FROM data_pipeline.column_profile "
                "WHERE batch_id = %s ORDER BY ordinal_position",
                (self.legacy_profiled_batch_id,),
            ).fetchall()
            profiled_status = connection.execute(
                "SELECT status FROM data_pipeline.import_batch WHERE id = %s",
                (self.legacy_profiled_batch_id,),
            ).fetchone()[0]
            unprofiled_state = connection.execute(
                "SELECT operation.status, operation.attempt_count, "
                "operation.progress_current, operation.progress_total, batch.status "
                "FROM data_pipeline.import_operation AS operation "
                "JOIN data_pipeline.import_batch AS batch ON batch.id = operation.batch_id "
                "WHERE batch.id = %s",
                (self.legacy_unprofiled_batch_id,),
            ).fetchone()

        self.assertEqual(profiles, [("Price", 1), ("SKU", 2)])
        self.assertEqual(profiled_status, "profiled")
        self.assertEqual(unprofiled_state, ("queued", 0, 0, 0, "parsing"))

    def test_mapping_operation_payload_is_durable_and_claimable_across_rls(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, "
                "source_sha256, status) "
                "VALUES ('org-mapping', 'user-a', 's3://imports/mapping.csv', "
                "'mapping.csv', 'csv', %s, 'profiled') RETURNING id",
                ("d" * 64,),
            ).fetchone()[0]
            operation_id = connection.execute(
                "INSERT INTO data_pipeline.import_operation "
                "(org_id, batch_id, operation_type, request_payload) "
                "VALUES ('org-mapping', %s, 'apply_mapping', %s) RETURNING id",
                (batch_id, '{"mappings":{"SKU":"sku.sku_code"},"transformation_rules":[]}'),
            ).fetchone()[0]

        with psycopg.connect(self.service_url) as connection:
            claimed = connection.execute(
                "SELECT * FROM data_pipeline.claim_import_operation('mapping-worker', 60)"
            ).fetchone()
            self.assertEqual(claimed[0], operation_id)
            self.assertEqual(claimed[1], "org-mapping")
            self.assertEqual(claimed[3], "apply_mapping")
            self.assertEqual(claimed[6]["mappings"], {"SKU": "sku.sku_code"})

    def test_only_one_pipeline_operation_can_be_active_per_batch(self) -> None:
        with psycopg.connect(self.admin_url) as connection:
            batch_id = connection.execute(
                "INSERT INTO data_pipeline.import_batch "
                "(org_id, owner_id, source_file_url, source_filename, source_type, "
                "source_sha256, status) "
                "VALUES ('org-serial', 'user-a', 's3://imports/serial.csv', 'serial.csv', "
                "'csv', %s, 'profiled') RETURNING id",
                ("e" * 64,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO data_pipeline.import_operation "
                "(org_id, batch_id, operation_type) VALUES ('org-serial', %s, 'apply_mapping')",
                (batch_id,),
            )
            with self.assertRaises(psycopg.errors.UniqueViolation):
                connection.execute(
                    "INSERT INTO data_pipeline.import_operation "
                    "(org_id, batch_id, operation_type) VALUES ('org-serial', %s, 'validate')",
                    (batch_id,),
                )

    def test_outbox_is_leased_through_functions_and_cannot_be_deleted_directly(self) -> None:
        event_id = uuid4()
        with psycopg.connect(self.admin_url) as connection:
            connection.execute(
                """
                INSERT INTO data_pipeline.outbox_event (
                    id, org_id, event_type, aggregate_type, aggregate_id,
                    partition_key, payload, occurred_at
                ) VALUES (%s, 'org-outbox', 'import.committed', 'import_batch',
                          'batch-outbox', 'batch-outbox', %s, now())
                """,
                (event_id, b"event"),
            )

        with psycopg.connect(self.service_url) as connection:
            connection.execute("SELECT set_config('app.org_id', 'org-outbox', false)")
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                connection.execute(
                    "DELETE FROM data_pipeline.outbox_event WHERE id = %s", (event_id,)
                )
            connection.rollback()

        with psycopg.connect(self.service_url) as connection:
            claimed = connection.execute(
                "SELECT id, attempts FROM data_pipeline.claim_outbox_events(10, 30)"
            ).fetchone()
            self.assertEqual(claimed, (event_id, 1))
            connection.execute("SELECT data_pipeline.mark_outbox_published(%s)", (event_id,))

        with psycopg.connect(self.admin_url) as connection:
            published = connection.execute(
                "SELECT published_at IS NOT NULL FROM data_pipeline.outbox_event WHERE id = %s",
                (event_id,),
            ).fetchone()[0]
        self.assertTrue(published)

    def test_fx_history_is_tenant_isolated_idempotent_and_bitemporal(self) -> None:
        calculator = FxCalculator(FxRateRepository(Database(self.service_url, 1_000)))
        effective_at = datetime(2026, 7, 31, 16, tzinfo=UTC)
        first, replayed = calculator.record_snapshot(
            org_id="org-fx-a",
            user_id="user-a",
            idempotency_key="close-1",
            source="treasury",
            base_currency="USD",
            effective_at=effective_at,
            rates=(("NGN", "1500"), ("GBP", "0.75")),
        )
        self.assertFalse(replayed)
        replay, replayed = calculator.record_snapshot(
            org_id="org-fx-a",
            user_id="user-a",
            idempotency_key="close-1",
            source="treasury",
            base_currency="USD",
            effective_at=effective_at,
            rates=(("GBP", "0.7500"), ("NGN", "1500.0")),
        )
        self.assertTrue(replayed)
        self.assertEqual(replay.id, first.id)

        with self.assertRaises(FxConflictError):
            calculator.record_snapshot(
                org_id="org-fx-a",
                user_id="user-a",
                idempotency_key="close-1",
                source="treasury",
                base_currency="USD",
                effective_at=effective_at,
                rates=(("NGN", "1600"),),
            )

        second, _ = calculator.record_snapshot(
            org_id="org-fx-a",
            user_id="user-a",
            idempotency_key="close-2",
            source="treasury",
            base_currency="USD",
            effective_at=effective_at,
            rates=(("NGN", "1600"),),
        )
        historical = calculator.quote(
            org_id="org-fx-a",
            source_currency="USD",
            target_currency="NGN",
            rate_source_name="treasury",
            effective_at=effective_at,
            recorded_as_of=first.recorded_at,
        )
        current = calculator.quote(
            org_id="org-fx-a",
            source_currency="USD",
            target_currency="NGN",
            rate_source_name="treasury",
            effective_at=effective_at,
            recorded_as_of=second.recorded_at,
        )
        self.assertEqual(str(historical.rate), "1500.000000000000000000")
        self.assertEqual(str(current.rate), "1600.000000000000000000")

        with self.assertRaises(FxRateNotFoundError):
            calculator.quote(
                org_id="org-fx-b",
                source_currency="USD",
                target_currency="NGN",
                rate_source_name="treasury",
                effective_at=effective_at,
                recorded_as_of=second.recorded_at,
            )
        with (
            self.assertRaises(psycopg.errors.InsufficientPrivilege),
            Database(self.service_url, 1_000).transaction("org-fx-a") as connection,
        ):
            connection.execute(
                "UPDATE data_pipeline.fx_rate_snapshot SET source = 'changed' WHERE id = %s",
                (first.id,),
            )

    def test_z_down_migration_removes_owned_tables(self) -> None:
        with psycopg.connect(self.admin_url, autocommit=True) as connection:
            for filename in (
                "0008_fx_rate_snapshots.down.sql",
                "0007_canonical_commit_outbox.down.sql",
                "0006_validation_operations.down.sql",
                "0005_mapping_operations.down.sql",
                "0004_column_profile_ordinal_position.down.sql",
                "0003_claim_import_operations.down.sql",
                "0002_data_pipeline_foundation.down.sql",
                "0001_create_schema.down.sql",
            ):
                connection.execute(self._migration_path(filename).read_text())
            count = connection.execute(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'data_pipeline'"
            ).fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
