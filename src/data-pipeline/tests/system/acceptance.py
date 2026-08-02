from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
CATALOG_PASSWORD = "acceptance_catalog_password"
DATA_PIPELINE_PASSWORD = "acceptance_data_pipeline_password"
POSTGRES_PASSWORD = "acceptance_postgres_password"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
GATEWAY_CATALOG_SECRET = "acceptance-gateway-catalog-secret-change-me"
GATEWAY_PIPELINE_SECRET = "acceptance-gateway-pipeline-secret-change-me"
PIPELINE_CATALOG_SECRET = "acceptance-pipeline-catalog-secret-change-me"
USER_JWT_SECRET = "acceptance-user-jwt-secret-change-me"
ORG_ID = "org-acceptance"
USER_ID = "user-acceptance"


def run(
    command: list[str],
    *,
    cwd: Path = REPO_ROOT,
    input_bytes: bytes | None = None,
    capture: bool = False,
) -> subprocess.CompletedProcess[bytes]:
    print("+", " ".join(command), flush=True)
    return subprocess.run(
        command,
        cwd=cwd,
        input=input_bytes,
        check=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


class AcceptanceStack:
    def __init__(self, *, keep_images: bool) -> None:
        suffix = uuid4().hex[:10]
        self.network = f"owomide-acceptance-{suffix}"
        self.keep_images = keep_images
        self.images = {
            "catalog": f"owomide/catalog:acceptance-{suffix}",
            "data-pipeline": f"owomide/data-pipeline:acceptance-{suffix}",
            "gateway": f"owomide/gateway:acceptance-{suffix}",
        }
        self.containers = {
            name: f"owomide-acceptance-{name}-{suffix}"
            for name in (
                "postgres",
                "minio",
                "kafka",
                "catalog",
                "catalog-worker",
                "data-pipeline",
                "data-pipeline-worker",
                "gateway",
            )
        }

    def build_images(self) -> None:
        for name, dockerfile in (
            ("catalog", "src/catalog/Dockerfile"),
            ("data-pipeline", "src/data-pipeline/Dockerfile"),
            ("gateway", "src/gateway/Dockerfile"),
        ):
            run(
                [
                    "docker",
                    "build",
                    "--tag",
                    self.images[name],
                    "--file",
                    dockerfile,
                    ".",
                ]
            )

    def start(self) -> None:
        run(["docker", "network", "create", self.network])
        self._container(
            "postgres",
            "postgres:16-alpine",
            env={
                "POSTGRES_PASSWORD": POSTGRES_PASSWORD,
                "POSTGRES_DB": "owomide",
            },
        )
        self._wait_postgres()
        self._apply_migrations()

        self._container(
            "minio",
            "minio/minio:latest",
            env={
                "MINIO_ROOT_USER": MINIO_ACCESS_KEY,
                "MINIO_ROOT_PASSWORD": MINIO_SECRET_KEY,
            },
            command=["minio", "server", "/data"],
        )
        self._container(
            "kafka",
            "apache/kafka:3.7.0",
            env={
                "KAFKA_NODE_ID": "1",
                "KAFKA_PROCESS_ROLES": "broker,controller",
                "KAFKA_LISTENERS": "PLAINTEXT://:9092,CONTROLLER://:9093",
                "KAFKA_ADVERTISED_LISTENERS": "PLAINTEXT://kafka:9092",
                "KAFKA_LISTENER_SECURITY_PROTOCOL_MAP": (
                    "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
                ),
                "KAFKA_CONTROLLER_QUORUM_VOTERS": "1@localhost:9093",
                "KAFKA_CONTROLLER_LISTENER_NAMES": "CONTROLLER",
                "KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR": "1",
                "KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR": "1",
                "KAFKA_TRANSACTION_STATE_LOG_MIN_ISR": "1",
                "KAFKA_AUTO_CREATE_TOPICS_ENABLE": "true",
            },
        )
        self._wait_kafka()
        self._create_topics()

        catalog_env = {
            "CATALOG_DATABASE_URL": self._database_url("catalog_svc", CATALOG_PASSWORD),
            "CATALOG_SERVICE_SECRETS_JSON": json.dumps(
                {
                    "gateway_svc": GATEWAY_CATALOG_SECRET,
                    "data_pipeline_svc": PIPELINE_CATALOG_SECRET,
                }
            ),
            "KAFKA_BROKERS": "kafka:9092",
            "KAFKA_CLIENT_ID": "catalog-acceptance",
            "LOG_LEVEL": "warn",
        }
        self._container("catalog", self.images["catalog"], env=catalog_env)
        self._container(
            "catalog-worker",
            self.images["catalog"],
            env=catalog_env,
            command=["node", "src/catalog/dist/worker.js"],
        )

        pipeline_env = {
            "DATA_PIPELINE_DATABASE_URL": self._database_url(
                "data_pipeline_svc", DATA_PIPELINE_PASSWORD
            ),
            "DATA_PIPELINE_SERVICE_SECRETS_JSON": json.dumps(
                {"gateway_svc": GATEWAY_PIPELINE_SECRET}
            ),
            "DATA_PIPELINE_OBJECT_STORE_ENDPOINT": "minio:9000",
            "DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY": MINIO_ACCESS_KEY,
            "DATA_PIPELINE_OBJECT_STORE_SECRET_KEY": MINIO_SECRET_KEY,
            "DATA_PIPELINE_OBJECT_STORE_BUCKET": "acceptance-imports",
            "DATA_PIPELINE_CATALOG_SERVICE_URL": "catalog:50052",
            "DATA_PIPELINE_CATALOG_SERVICE_SECRET": PIPELINE_CATALOG_SECRET,
            "DATA_PIPELINE_WORKER_POLL_SECONDS": "0.1",
            "DATA_PIPELINE_OUTBOX_LEASE_SECONDS": "5",
            "KAFKA_BROKERS": "kafka:9092",
            "DATA_PIPELINE_KAFKA_CLIENT_ID": "data-pipeline-acceptance",
            "LOG_LEVEL": "INFO",
        }
        self._container("data-pipeline", self.images["data-pipeline"], env=pipeline_env)
        self._container(
            "data-pipeline-worker",
            self.images["data-pipeline"],
            env=pipeline_env,
            command=["python", "-m", "owomide_data_pipeline.worker"],
        )

        self._container(
            "gateway",
            self.images["gateway"],
            env={
                "NODE_ENV": "test",
                "PORT": "5000",
                "JWT_SECRET": USER_JWT_SECRET,
                "DEV_USER_EMAIL": "acceptance@owomide.local",
                "DEV_USER_PASSWORD": "acceptance",
                "DEV_USER_ORG_ID": ORG_ID,
                "DEV_USER_ID": USER_ID,
                "DEV_USER_ROLES": "admin",
                "CATALOG_SERVICE_URL": "http://catalog:50052",
                "DATA_PIPELINE_SERVICE_URL": "http://data-pipeline:50055",
                "CATALOG_GATEWAY_SERVICE_SECRET": GATEWAY_CATALOG_SECRET,
                "DATA_PIPELINE_GATEWAY_SERVICE_SECRET": GATEWAY_PIPELINE_SECRET,
                "LOG_LEVEL": "warn",
            },
        )
        self._restart_workers()

    def run_scenario(self) -> None:
        run(
            [
                "docker",
                "run",
                "--rm",
                "--network",
                self.network,
                "--volume",
                f"{REPO_ROOT}:/workspace:ro",
                "--env",
                f"ACCEPTANCE_POSTGRES_PASSWORD={POSTGRES_PASSWORD}",
                self.images["data-pipeline"],
                "python",
                "/workspace/src/data-pipeline/tests/system/acceptance.py",
                "--scenario",
            ]
        )

    def logs(self) -> None:
        for logical_name in (
            "gateway",
            "data-pipeline",
            "data-pipeline-worker",
            "catalog",
            "catalog-worker",
            "kafka",
        ):
            name = self.containers[logical_name]
            print(f"\n===== {logical_name} ({name}) =====", file=sys.stderr)
            subprocess.run(
                ["docker", "logs", "--tail", "200", name],
                check=False,
                stdout=sys.stderr,
                stderr=sys.stderr,
            )

    def cleanup(self) -> None:
        for name in reversed(tuple(self.containers.values())):
            subprocess.run(
                ["docker", "rm", "--force", name],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        subprocess.run(
            ["docker", "network", "rm", self.network],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not self.keep_images:
            for image in self.images.values():
                subprocess.run(
                    ["docker", "image", "rm", image],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

    def _container(
        self,
        logical_name: str,
        image: str,
        *,
        env: dict[str, str],
        command: list[str] | None = None,
    ) -> None:
        args = [
            "docker",
            "run",
            "--detach",
            "--rm",
            "--name",
            self.containers[logical_name],
            "--network",
            self.network,
            "--network-alias",
            logical_name,
        ]
        for key, value in env.items():
            args.extend(("--env", f"{key}={value}"))
        args.append(image)
        if command:
            args.extend(command)
        run(args, capture=True)

    def _wait_postgres(self) -> None:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    self.containers["postgres"],
                    "psql",
                    "--username",
                    "postgres",
                    "--dbname",
                    "owomide",
                    "--tuples-only",
                    "--command",
                    "SELECT 1",
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if result.returncode == 0:
                return
            time.sleep(0.5)
        raise RuntimeError("PostgreSQL did not become ready")

    def _wait_kafka(self) -> None:
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    self.containers["kafka"],
                    "/opt/kafka/bin/kafka-topics.sh",
                    "--bootstrap-server",
                    "localhost:9092",
                    "--list",
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if result.returncode == 0:
                return
            time.sleep(1)
        raise RuntimeError("Kafka did not become ready")

    def _create_topics(self) -> None:
        for topic in (
            "import.committed",
            "catalog.sku_added",
            "catalog.cost_updated",
            "catalog.price_updated",
        ):
            run(
                [
                    "docker",
                    "exec",
                    self.containers["kafka"],
                    "/opt/kafka/bin/kafka-topics.sh",
                    "--bootstrap-server",
                    "localhost:9092",
                    "--create",
                    "--if-not-exists",
                    "--topic",
                    topic,
                    "--partitions",
                    "1",
                    "--replication-factor",
                    "1",
                ],
                capture=True,
            )

    def _restart_workers(self) -> None:
        for logical_name in ("catalog-worker", "data-pipeline-worker"):
            run(["docker", "restart", self.containers[logical_name]], capture=True)

    def _apply_migrations(self) -> None:
        bootstrap = f"""
            CREATE SCHEMA catalog;
            CREATE SCHEMA data_pipeline;
            CREATE ROLE catalog_svc LOGIN PASSWORD '{CATALOG_PASSWORD}';
            CREATE ROLE data_pipeline_svc LOGIN PASSWORD '{DATA_PIPELINE_PASSWORD}';
            GRANT USAGE ON SCHEMA catalog TO catalog_svc;
            GRANT USAGE ON SCHEMA data_pipeline TO data_pipeline_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
              GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO catalog_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
              GRANT USAGE, SELECT ON SEQUENCES TO catalog_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
              GRANT EXECUTE ON FUNCTIONS TO catalog_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA data_pipeline
              GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO data_pipeline_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA data_pipeline
              GRANT USAGE, SELECT ON SEQUENCES TO data_pipeline_svc;
            ALTER DEFAULT PRIVILEGES IN SCHEMA data_pipeline
              GRANT EXECUTE ON FUNCTIONS TO data_pipeline_svc;
        """.encode()
        self._psql(bootstrap)
        for service in ("catalog", "data-pipeline"):
            directory = REPO_ROOT / "src" / service / "migrations"
            for path in sorted(directory.glob("*.up.sql")):
                self._psql(path.read_bytes())

    def _psql(self, sql: bytes) -> None:
        run(
            [
                "docker",
                "exec",
                "--interactive",
                self.containers["postgres"],
                "psql",
                "--set",
                "ON_ERROR_STOP=1",
                "--username",
                "postgres",
                "--dbname",
                "owomide",
            ],
            input_bytes=sql,
            capture=True,
        )

    @staticmethod
    def _database_url(user: str, password: str) -> str:
        return f"postgresql://{user}:{password}@postgres:5432/owomide"


class ApiError(RuntimeError):
    def __init__(self, status: int, payload: object) -> None:
        super().__init__(f"HTTP {status}: {payload}")
        self.status = status
        self.payload = payload


class AcceptanceScenario:
    def __init__(self) -> None:
        self.gateway = "http://gateway:5000"
        self.token = ""
        self.import_event_ids: dict[str, set[str]] = {}

    async def run(self) -> None:
        await self._wait_services()
        self.token = self._login()
        self._assert_fx_intelligence()
        references = self._create_references()

        from aiokafka import AIOKafkaConsumer

        consumer = AIOKafkaConsumer(
            "import.committed",
            "catalog.sku_added",
            "catalog.cost_updated",
            "catalog.price_updated",
            bootstrap_servers="kafka:9092",
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        await consumer.start()
        try:
            before_commit = datetime.now(UTC)
            csv_batch = self._run_csv_history()
            xlsx_batch = self._run_xlsx(references)
            invalid_batch = self._run_invalid_csv()
            await self._assert_events(
                consumer,
                {
                    csv_batch: (2, 0, 0, 0),
                    xlsx_batch: (0, 1, 0, 0),
                },
            )
            self._assert_catalog_history(csv_batch, before_commit)
            self._assert_xlsx_catalog(xlsx_batch, references)
            self._assert_durability_and_idempotency(csv_batch, xlsx_batch, invalid_batch)
            self._assert_tenant_isolation(csv_batch)
        finally:
            await consumer.stop()
        print("Data Pipeline system acceptance passed", flush=True)

    async def _wait_services(self) -> None:
        deadline = time.monotonic() + 90
        urls = (
            "http://gateway:5000/health",
            "http://catalog:8080/readyz",
            "http://data-pipeline:8080/readyz",
        )
        remaining = set(urls)
        while remaining and time.monotonic() < deadline:
            for url in tuple(remaining):
                try:
                    with urllib.request.urlopen(url, timeout=2) as response:
                        if response.status == 200:
                            remaining.remove(url)
                except (OSError, urllib.error.URLError):
                    pass
            if remaining:
                await asyncio.sleep(0.5)
        if remaining:
            raise RuntimeError(f"Services did not become ready: {sorted(remaining)}")

    def _login(self) -> str:
        response = self._request(
            "POST",
            "/auth/login",
            body={"email": "acceptance@owomide.local", "password": "acceptance"},
            authenticated=False,
        )
        return str(response["token"])

    def _assert_fx_intelligence(self) -> None:
        effective_at = "2026-08-01T16:00:00Z"
        first = self._request(
            "POST",
            "/intelligence/fx/rate-snapshots",
            body={
                "idempotencyKey": "acceptance-fx-close-1",
                "source": "treasury",
                "baseCurrency": "USD",
                "effectiveAt": effective_at,
                "rates": [
                    {"currency": "GBP", "rate": "0.75"},
                    {"currency": "NGN", "rate": "1500"},
                ],
                "providerRef": "acceptance-close-1",
            },
        )
        self._expect(first, {"replayed": False})
        first_snapshot = first.get("snapshot")
        if not isinstance(first_snapshot, dict):
            raise AssertionError(f"FX snapshot response is invalid: {first}")
        self._expect(
            first_snapshot,
            {"orgId": ORG_ID, "source": "treasury", "baseCurrency": "USD"},
        )
        replay = self._request(
            "POST",
            "/intelligence/fx/rate-snapshots",
            body={
                "idempotencyKey": "acceptance-fx-close-1",
                "source": "treasury",
                "baseCurrency": "USD",
                "effectiveAt": effective_at,
                "rates": [
                    {"currency": "NGN", "rate": "1500.0"},
                    {"currency": "GBP", "rate": "0.7500"},
                ],
                "providerRef": "acceptance-close-1",
            },
        )
        self._expect(replay, {"replayed": True})
        replay_snapshot = replay.get("snapshot")
        if (
            not isinstance(replay_snapshot, dict)
            or replay_snapshot.get("id") != first_snapshot["id"]
        ):
            raise AssertionError("FX idempotency replay returned a different snapshot")

        second = self._request(
            "POST",
            "/intelligence/fx/rate-snapshots",
            body={
                "idempotencyKey": "acceptance-fx-close-2",
                "source": "treasury",
                "baseCurrency": "USD",
                "effectiveAt": effective_at,
                "rates": [{"currency": "NGN", "rate": "1600"}],
                "providerRef": "acceptance-close-2",
            },
        )
        second_snapshot = second.get("snapshot")
        if not isinstance(second_snapshot, dict):
            raise AssertionError(f"FX snapshot response is invalid: {second}")
        query = urllib.parse.urlencode(
            {
                "sourceCurrency": "USD",
                "targetCurrency": "NGN",
                "rateSource": "treasury",
                "effectiveAt": effective_at,
                "recordedAsOf": first_snapshot["recordedAt"],
            }
        )
        historical = self._request("GET", f"/intelligence/fx/rates?{query}")
        historical_quote = historical.get("quote")
        if not isinstance(historical_quote, dict):
            raise AssertionError(f"Historical FX response is invalid: {historical}")
        self._expect(historical_quote, {"rate": "1500", "snapshotId": first_snapshot["id"]})

        current_query = urllib.parse.urlencode(
            {
                "sourceCurrency": "USD",
                "targetCurrency": "NGN",
                "rateSource": "treasury",
                "effectiveAt": effective_at,
            }
        )
        current = self._request("GET", f"/intelligence/fx/rates?{current_query}")
        current_quote = current.get("quote")
        if not isinstance(current_quote, dict):
            raise AssertionError(f"Current FX response is invalid: {current}")
        self._expect(current_quote, {"rate": "1600", "snapshotId": second_snapshot["id"]})
        converted = self._request(
            "POST",
            "/intelligence/fx/convert",
            body={
                "amountMinor": "1050",
                "sourceCurrency": "USD",
                "targetCurrency": "NGN",
                "rateSource": "treasury",
                "effectiveAt": effective_at,
                "recordedAsOf": first_snapshot["recordedAt"],
            },
        )
        self._expect(
            converted,
            {
                "sourceAmountMinor": "1050",
                "targetAmountMinor": "1575000",
                "sourceMinorUnit": 2,
                "targetMinorUnit": 2,
                "roundingMode": "FX_ROUNDING_MODE_HALF_EVEN",
            },
        )
        converted_quote = converted.get("quote")
        if not isinstance(converted_quote, dict):
            raise AssertionError(f"FX conversion response is invalid: {converted}")
        self._expect(converted_quote, {"snapshotId": first_snapshot["id"]})

    def _create_references(self) -> dict[str, str]:
        channel = self._request(
            "POST",
            "/catalog/channels",
            body={
                "code": "retail",
                "name": "Retail",
                "defaultCurrency": "NGN",
                "attributesJson": "{}",
            },
        )["channel"]
        location = self._request(
            "POST",
            "/catalog/locations",
            body={
                "code": "lagos",
                "name": "Lagos",
                "country": "NG",
                "region": "Lagos",
                "attributesJson": "{}",
            },
        )["location"]
        segment = self._request(
            "POST",
            "/catalog/customer-segments",
            body={
                "code": "enterprise",
                "name": "Enterprise",
                "attributesJson": "{}",
            },
        )["customerSegment"]
        return {
            "channel_id": str(channel["id"]),
            "location_id": str(location["id"]),
            "segment_id": str(segment["id"]),
        }

    def _run_csv_history(self) -> str:
        upload = self._upload(
            "retail_price_history.csv",
            (FIXTURES / "retail_price_history.csv").read_bytes(),
        )
        batch_id = str(upload["batchId"])
        self._wait_operation(batch_id, str(upload["operationId"]))
        profile = self._request("GET", f"/imports/{batch_id}/profile")
        self._assert_profile_columns(
            profile,
            {
                "Item Code",
                "Selling Price",
                "Unit Cost",
                "Price Effective Date",
                "Cost Effective Date",
                "Price List",
            },
        )
        mapping = self._request(
            "PUT",
            f"/imports/{batch_id}/mapping",
            body={
                "mappings": {
                    "Item Code": "sku.sku_code",
                    "Selling Price": "price_record.price_minor",
                    "Price Currency": "price_record.currency",
                    "Unit Cost": "cost_record.cost_minor",
                    "Cost Currency": "cost_record.currency",
                    "Price Effective Date": "price_record.effective_at",
                    "Cost Effective Date": "cost_record.effective_at",
                    "Price List": "channel.code",
                    "Pack Size": "sku.pack_size",
                    "Unit": "sku.unit",
                    "Tax Included": "price_record.tax_inclusive",
                },
                "transformationRules": [
                    {
                        "field": "Selling Price",
                        "type": "decimal_to_minor_units",
                        "scale": 2,
                    },
                    {
                        "field": "Unit Cost",
                        "type": "decimal_to_minor_units",
                        "scale": 2,
                    },
                    {"field": "Pack Size", "type": "pack_size_normalize"},
                    {
                        "field": "Unit",
                        "type": "unit_normalize",
                        "aliases": {"case": "CASE"},
                    },
                    {"field": "Tax Included", "type": "tax_flag"},
                ],
            },
        )
        self._wait_operation(batch_id, str(mapping["operationId"]))
        report = self._wait_validation(batch_id)
        self._expect(report["rowCounts"], {"ok": 2, "warned": 0, "errored": 0})
        committed = self._request(
            "POST", f"/imports/{batch_id}/commit", body={"confirmWarnings": False}
        )
        operation_id = str(committed["operation"]["id"])
        completed = self._wait_operation(batch_id, operation_id)
        self._expect(
            completed["operation"]["commitResult"]["rowCounts"],
            {"ok": 2, "warned": 0, "errored": 0},
        )
        replay = self._request(
            "POST", f"/imports/{batch_id}/commit", body={"confirmWarnings": False}
        )
        if replay["operation"]["id"] != operation_id:
            raise AssertionError("Repeated commit did not return the original operation")
        return batch_id

    def _run_xlsx(self, references: dict[str, str]) -> str:
        upload = self._upload("regional_identifier_prices.xlsx", self._xlsx(references))
        batch_id = str(upload["batchId"])
        self._wait_operation(batch_id, str(upload["operationId"]))
        mapping = self._request(
            "PUT",
            f"/imports/{batch_id}/mapping",
            body={
                "mappings": {
                    "GTIN": "sku.identifier",
                    "Identifier Type": "sku.identifier_type",
                    "SKU": "sku.sku_code",
                    "Channel ID": "price_record.channel_id",
                    "Location ID": "price_record.location_id",
                    "Segment ID": "price_record.customer_segment_id",
                    "Selling Price": "price_record.price_minor",
                    "Price Currency": "price_record.currency",
                    "Effective From": "price_record.effective_at",
                    "Effective To": "price_record.effective_until",
                    "Unit Cost": "cost_record.cost_minor",
                    "Cost Currency": "cost_record.currency",
                    "Cost Effective": "cost_record.effective_at",
                },
                "transformationRules": [
                    {
                        "field": "Selling Price",
                        "type": "decimal_to_minor_units",
                        "scale": 2,
                    },
                    {
                        "field": "Unit Cost",
                        "type": "decimal_to_minor_units",
                        "scale": 2,
                    },
                ],
            },
        )
        self._wait_operation(batch_id, str(mapping["operationId"]))
        report = self._wait_validation(batch_id)
        self._expect(report["rowCounts"], {"ok": 0, "warned": 1, "errored": 0})
        try:
            self._request("POST", f"/imports/{batch_id}/commit", body={"confirmWarnings": False})
        except ApiError as exc:
            if exc.status != 422:
                raise
        else:
            raise AssertionError("Warned XLSX row committed without explicit confirmation")
        committed = self._request(
            "POST", f"/imports/{batch_id}/commit", body={"confirmWarnings": True}
        )
        self._wait_operation(batch_id, str(committed["operation"]["id"]))
        return batch_id

    def _run_invalid_csv(self) -> str:
        upload = self._upload(
            "invalid_pricing_rows.csv",
            (FIXTURES / "invalid_pricing_rows.csv").read_bytes(),
        )
        batch_id = str(upload["batchId"])
        self._wait_operation(batch_id, str(upload["operationId"]))
        mapping = self._request(
            "PUT",
            f"/imports/{batch_id}/mapping",
            body={
                "mappings": {
                    "SKU": "sku.sku_code",
                    "Price": "price_record.price_minor",
                    "Currency": "price_record.currency",
                    "Effective Date": "price_record.effective_at",
                    "Channel": "channel.code",
                },
                "transformationRules": [],
            },
        )
        self._wait_operation(batch_id, str(mapping["operationId"]))
        report = self._wait_validation(batch_id)
        codes = {event["code"] for event in report["events"]}
        expected = {
            "missing_sku_identity",
            "invalid_price",
            "invalid_currency",
            "invalid_effective_date",
            "unknown_channel",
        }
        if not expected <= codes:
            raise AssertionError(f"Invalid fixture findings missing {sorted(expected - codes)}")
        self._expect(report["rowCounts"], {"ok": 0, "warned": 0, "errored": 1})
        return batch_id

    async def _assert_events(
        self,
        consumer,
        expected_counts: dict[str, tuple[int, int, int, int]],
    ) -> None:
        from events.catalog import v1_pb2 as catalog_events_pb2
        from owomide_bus import deserialize

        import_events_pb2 = __import__("importlib").import_module("events.import.v1_pb2")
        batch_ids = set(expected_counts)
        deadline = time.monotonic() + 30
        committed: dict[str, object] = {}
        catalog_source_refs: set[str] = set()
        while time.monotonic() < deadline and (
            set(committed) != batch_ids or not batch_ids <= catalog_source_refs
        ):
            records = await consumer.getmany(timeout_ms=1_000, max_records=200)
            for messages in records.values():
                for message in messages:
                    event = deserialize(message.value)
                    if message.key != event.partition_key.encode():
                        raise AssertionError("Kafka key does not match envelope partition key")
                    if event.type == "import.committed":
                        payload = import_events_pb2.ImportCommitted()
                        payload.ParseFromString(event.payload)
                        if payload.batch_id in batch_ids:
                            committed[payload.batch_id] = payload
                            if event.partition_key != payload.batch_id:
                                raise AssertionError("Import event is not partitioned by batch ID")
                            self.import_event_ids.setdefault(payload.batch_id, set()).add(event.id)
                    elif event.type == "catalog.sku_added":
                        payload = catalog_events_pb2.SkuAdded()
                        payload.ParseFromString(event.payload)
                        catalog_source_refs.add(payload.source_ref)
                    elif event.type == "catalog.cost_updated":
                        payload = catalog_events_pb2.CostUpdated()
                        payload.ParseFromString(event.payload)
                        catalog_source_refs.add(payload.source_ref)
                    elif event.type == "catalog.price_updated":
                        payload = catalog_events_pb2.PriceUpdated()
                        payload.ParseFromString(event.payload)
                        catalog_source_refs.add(payload.source_ref)
        if set(committed) != batch_ids:
            raise AssertionError(f"Missing import events for {sorted(batch_ids - set(committed))}")
        if not batch_ids <= catalog_source_refs:
            raise AssertionError(
                f"Missing Catalog events for {sorted(batch_ids - catalog_source_refs)}"
            )
        if any(payload.org_id != ORG_ID for payload in committed.values()):
            raise AssertionError("Import event lost tenant context")
        for batch_id, payload in committed.items():
            row_counts = payload.row_counts
            actual = (
                row_counts.ok,
                row_counts.warned,
                row_counts.excluded,
                row_counts.errored,
            )
            if actual != expected_counts[batch_id]:
                raise AssertionError(
                    f"Import event counts for {batch_id} are {actual}, "
                    f"expected {expected_counts[batch_id]}"
                )
            if (
                payload.actor_id != USER_ID
                or not payload.file_url
                or not payload.HasField("created_at")
            ):
                raise AssertionError("Import event provenance is incomplete")
        duplicate_logical_events = {
            batch_id: sorted(event_ids)
            for batch_id, event_ids in self.import_event_ids.items()
            if len(event_ids) != 1
        }
        if duplicate_logical_events:
            raise AssertionError(
                f"Multiple logical import events observed: {duplicate_logical_events}"
            )

    def _assert_catalog_history(self, batch_id: str, before_commit: datetime) -> None:
        from services.catalog.v1 import catalog_pb2

        stub, metadata = self._catalog()
        skus = stub.ListSkus(
            catalog_pb2.ListSkusRequest(query="SKU-HISTORY-001", pagination={"page_size": 10}),
            metadata=metadata,
        ).skus
        if len(skus) != 1:
            raise AssertionError(f"Expected one history SKU, found {len(skus)}")
        sku = skus[0]
        if sku.pack_size != 12 or sku.unit != "CASE":
            raise AssertionError("SKU pack size or normalized unit was not committed")
        march = self._timestamp(datetime(2026, 3, 1, tzinfo=UTC))
        july = self._timestamp(datetime(2026, 7, 1, tzinfo=UTC))
        old_price = stub.BatchGetPrices(
            catalog_pb2.BatchGetPricesRequest(sku_ids=[sku.id], effective_as_of=march),
            metadata=metadata,
        ).prices
        new_price = stub.BatchGetPrices(
            catalog_pb2.BatchGetPricesRequest(sku_ids=[sku.id], effective_as_of=july),
            metadata=metadata,
        ).prices
        if [row.price.amount for row in old_price] != [1000]:
            raise AssertionError("March effective-as-of price is incorrect")
        if [row.price.amount for row in new_price] != [1200]:
            raise AssertionError("July effective-as-of price is incorrect")
        old_cost = stub.BatchGetCosts(
            catalog_pb2.BatchGetCostsRequest(sku_ids=[sku.id], effective_as_of=march),
            metadata=metadata,
        ).costs
        new_cost = stub.BatchGetCosts(
            catalog_pb2.BatchGetCostsRequest(sku_ids=[sku.id], effective_as_of=july),
            metadata=metadata,
        ).costs
        if [row.cost.amount for row in old_cost] != [800] or [
            row.cost.amount for row in new_cost
        ] != [900]:
            raise AssertionError("Effective-as-of cost history is incorrect")
        if any(
            row.source_ref != batch_id
            or row.source_type != catalog_pb2.SOURCE_TYPE_IMPORT
            or row.actor_id != USER_ID
            or not row.source_item_ref
            for row in (*old_price, *new_price, *old_cost, *new_cost)
        ):
            raise AssertionError("Catalog import provenance is incomplete")
        recorded_before = stub.BatchGetPrices(
            catalog_pb2.BatchGetPricesRequest(
                sku_ids=[sku.id],
                effective_as_of=july,
                recorded_as_of=self._timestamp(before_commit),
            ),
            metadata=metadata,
        ).prices
        if recorded_before:
            raise AssertionError("Recorded-as-of query leaked knowledge from after the timestamp")

    def _assert_xlsx_catalog(self, batch_id: str, references: dict[str, str]) -> None:
        from services.catalog.v1 import catalog_pb2

        stub, metadata = self._catalog()
        skus = stub.ListSkus(
            catalog_pb2.ListSkusRequest(query="SKU-XLSX-001", pagination={"page_size": 10}),
            metadata=metadata,
        ).skus
        if len(skus) != 1 or not skus[0].identifiers:
            raise AssertionError("XLSX SKU or typed identifier was not committed")
        sku = skus[0]
        identifier = sku.identifiers[0]
        if identifier.type != "gtin" or identifier.value != "0123456789012":
            raise AssertionError("XLSX typed identifier changed during import")
        prices = stub.BatchGetPrices(
            catalog_pb2.BatchGetPricesRequest(
                sku_ids=[sku.id],
                channel_id=references["channel_id"],
                location_id=references["location_id"],
                customer_segment_id=references["segment_id"],
                effective_as_of=self._timestamp(datetime(2026, 10, 1, tzinfo=UTC)),
            ),
            metadata=metadata,
        ).prices
        if len(prices) != 1 or prices[0].price.amount != 1525 or prices[0].price.currency != "USD":
            raise AssertionError("XLSX price dimensions or money changed during import")
        if prices[0].source_ref != batch_id:
            raise AssertionError("XLSX Catalog provenance is incorrect")

    def _assert_durability_and_idempotency(
        self,
        csv_batch: str,
        xlsx_batch: str,
        invalid_batch: str,
    ) -> None:
        import psycopg
        from minio import Minio

        with psycopg.connect(
            f"postgresql://postgres:{os.environ['ACCEPTANCE_POSTGRES_PASSWORD']}"
            "@postgres:5432/owomide"
        ) as connection:
            catalog_operations = connection.execute(
                "SELECT count(*) FROM catalog.write_operation WHERE idempotency_key LIKE %s",
                (f"import:{csv_batch}:%",),
            ).fetchone()[0]
            invalid_writes = connection.execute(
                "SELECT count(*) FROM catalog.price_record WHERE source_ref = %s",
                (invalid_batch,),
            ).fetchone()[0]
            outbox_rows = connection.execute(
                "SELECT aggregate_id, published_at IS NOT NULL "
                "FROM data_pipeline.outbox_event "
                "WHERE aggregate_id = ANY(%s::text[]) ORDER BY aggregate_id",
                ([csv_batch, xlsx_batch],),
            ).fetchall()
            batch_rows = connection.execute(
                "SELECT id::text, source_file_url FROM data_pipeline.import_batch "
                "WHERE id = ANY(%s::uuid[])",
                ([csv_batch, xlsx_batch, invalid_batch],),
            ).fetchall()
        if catalog_operations != 1:
            raise AssertionError("Repeated commit created duplicate Catalog write operations")
        if invalid_writes != 0:
            raise AssertionError("Invalid rows crossed the Catalog boundary")
        if len(outbox_rows) != 2 or not all(row[1] for row in outbox_rows):
            raise AssertionError("Import outbox rows were not published exactly once per batch")
        if len(batch_rows) != 3:
            raise AssertionError("One or more source import batches is missing")
        client = Minio(
            "minio:9000",
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False,
        )
        for _, source_url in batch_rows:
            object_name = source_url.split("/", 3)[3]
            client.stat_object("acceptance-imports", object_name)

    def _assert_tenant_isolation(self, batch_id: str) -> None:
        import jwt
        from services.catalog.v1 import catalog_pb2

        token = jwt.encode(
            {
                "sub": "user-other",
                "org_id": "org-other",
                "roles": ["admin"],
                "exp": datetime.now(UTC) + timedelta(minutes=5),
            },
            USER_JWT_SECRET,
            algorithm="HS256",
        )
        try:
            self._request("GET", f"/imports/{batch_id}", token=token)
        except ApiError as exc:
            if exc.status != 404:
                raise
        else:
            raise AssertionError("Cross-tenant import batch was visible")

        stub, _ = self._catalog()
        other_tenant_metadata = self._catalog_metadata(org_id="org-other")
        other_tenant_skus = stub.ListSkus(
            catalog_pb2.ListSkusRequest(query="SKU-HISTORY-001", pagination={"page_size": 10}),
            metadata=other_tenant_metadata,
        ).skus
        if other_tenant_skus:
            raise AssertionError("Cross-tenant Catalog SKU was visible")

    def _upload(self, filename: str, payload: bytes) -> dict[str, object]:
        boundary = f"owomide-{uuid4().hex}"
        body = (
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode()
            + payload
            + f"\r\n--{boundary}--\r\n".encode()
        )
        return self._request(
            "POST",
            "/imports?sourceSystem=acceptance-fixture",
            raw_body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )

    def _wait_operation(self, batch_id: str, operation_id: str) -> dict[str, object]:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            response = self._request("GET", f"/imports/{batch_id}/operations/{operation_id}")
            operation = response["operation"]
            status = str(operation["status"])
            if status.endswith("SUCCEEDED"):
                return response
            if status.endswith(("FAILED", "CANCELLED")):
                raise AssertionError(f"Operation {operation_id} failed: {operation}")
            time.sleep(0.1)
        raise TimeoutError(f"Operation {operation_id} did not complete")

    def _wait_validation(self, batch_id: str) -> dict[str, object]:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            batch = self._request("GET", f"/imports/{batch_id}")["batch"]
            status = str(batch["status"])
            if status.endswith("VALIDATED"):
                return self._request("GET", f"/imports/{batch_id}/validation?pageSize=200")
            if status.endswith("FAILED"):
                raise AssertionError(f"Validation failed: {batch}")
            time.sleep(0.1)
        raise TimeoutError(f"Batch {batch_id} was not validated")

    @staticmethod
    def _assert_profile_columns(profile: dict[str, object], expected: set[str]) -> None:
        actual = {column["columnName"] for column in profile["columns"]}
        if not expected <= actual:
            raise AssertionError(f"Profile missing columns {sorted(expected - actual)}")

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, object] | None = None,
        raw_body: bytes | None = None,
        content_type: str = "application/json",
        authenticated: bool = True,
        token: str | None = None,
    ) -> dict[str, object]:
        data = raw_body if raw_body is not None else (json.dumps(body).encode() if body else None)
        headers = {"content-type": content_type} if data is not None else {}
        credential = token if token is not None else self.token
        if authenticated:
            headers["authorization"] = f"Bearer {credential}"
        request = urllib.request.Request(
            f"{self.gateway}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
                return json.loads(payload) if payload else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            with suppress(json.JSONDecodeError):
                raise ApiError(exc.code, json.loads(raw)) from exc
            raise ApiError(exc.code, raw.decode(errors="replace")) from exc

    @staticmethod
    def _expect(actual: dict[str, object], expected: dict[str, object]) -> None:
        mismatched = {
            key: (actual.get(key, 0), value)
            for key, value in expected.items()
            if actual.get(key, 0) != value
        }
        if mismatched:
            raise AssertionError(f"Unexpected values: {mismatched}; actual={actual}")

    @staticmethod
    def _xlsx(references: dict[str, str]) -> bytes:
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Regional Pricing"
        sheet.append(
            [
                "GTIN",
                "Identifier Type",
                "SKU",
                "Channel ID",
                "Location ID",
                "Segment ID",
                "Selling Price",
                "Price Currency",
                "Effective From",
                "Effective To",
                "Unit Cost",
                "Cost Currency",
                "Cost Effective",
            ]
        )
        sheet.append(
            [
                "0123456789012",
                "gtin",
                "SKU-XLSX-001",
                references["channel_id"],
                references["location_id"],
                references["segment_id"],
                15.25,
                "USD",
                datetime(2026, 9, 1),
                datetime(2026, 12, 1),
                10,
                "USD",
                datetime(2026, 9, 1),
            ]
        )
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        return output.getvalue()

    @staticmethod
    def _timestamp(value: datetime):
        from google.protobuf.timestamp_pb2 import Timestamp

        timestamp = Timestamp()
        timestamp.FromDatetime(value)
        return timestamp

    @staticmethod
    def _catalog():
        import grpc
        from services.catalog.v1 import catalog_pb2_grpc

        metadata = AcceptanceScenario._catalog_metadata(org_id=ORG_ID)
        channel = grpc.insecure_channel("catalog:50052")
        return catalog_pb2_grpc.CatalogServiceStub(channel), metadata

    @staticmethod
    def _catalog_metadata(*, org_id: str):
        import jwt

        now = datetime.now(UTC)
        token = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "gateway_svc",
                "aud": "catalog",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            GATEWAY_CATALOG_SECRET,
            algorithm="HS256",
        )
        metadata = (
            ("authorization", f"Bearer {token}"),
            ("x-org-id", org_id),
            ("x-user-id", USER_ID),
            ("x-user-roles", "admin"),
        )
        return metadata


def host_main(keep_images: bool) -> None:
    stack = AcceptanceStack(keep_images=keep_images)
    failed = False
    try:
        stack.build_images()
        stack.start()
        stack.run_scenario()
    except BaseException:
        failed = True
        stack.logs()
        raise
    finally:
        stack.cleanup()
        if failed:
            print("Acceptance stack failed; service logs are above", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", action="store_true")
    parser.add_argument("--keep-images", action="store_true")
    args = parser.parse_args()
    if args.scenario:
        asyncio.run(AcceptanceScenario().run())
    else:
        host_main(args.keep_images)


if __name__ == "__main__":
    main()
