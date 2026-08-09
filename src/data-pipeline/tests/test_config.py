from __future__ import annotations

import unittest

from owomide_data_pipeline.config import Config, ConfigurationError


class ConfigTest(unittest.TestCase):
    def test_loads_typed_values_and_immutable_secrets(self) -> None:
        config = Config.from_env(
            {
                "DATA_PIPELINE_GRPC_PORT": "50123",
                "DATA_PIPELINE_GRPC_WORKERS": "8",
                "DATA_PIPELINE_WORKER_POLL_SECONDS": "0.25",
                "DATA_PIPELINE_OBJECT_STORE_SECURE": "true",
                "DATA_PIPELINE_UPLOAD_MAX_BYTES": "1024",
                "DATA_PIPELINE_FX_MAX_RATE_AGE_SECONDS": "86400",
                "DATA_PIPELINE_SERVICE_SECRETS_JSON": (
                    '{"gateway_svc":"a-development-secret-that-is-long-enough"}'
                ),
            }
        )

        self.assertEqual(config.grpc_port, 50_123)
        self.assertEqual(config.grpc_workers, 8)
        self.assertEqual(config.worker_poll_seconds, 0.25)
        self.assertTrue(config.object_store_secure)
        self.assertEqual(config.upload_max_bytes, 1024)
        self.assertEqual(config.fx_max_rate_age_seconds, 86_400)
        with self.assertRaises(TypeError):
            config.service_secrets["other"] = "not allowed"  # type: ignore[index]

    def test_rejects_invalid_secret_documents(self) -> None:
        for raw in ("not-json", "[]", '{"gateway_svc":"short"}'):
            with self.subTest(raw=raw), self.assertRaises(ConfigurationError):
                Config.from_env({"DATA_PIPELINE_SERVICE_SECRETS_JSON": raw})

    def test_production_fails_closed_without_service_credentials(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env({"OWOMIDE_ENV": "production"})

    def test_worker_mode_does_not_require_request_authentication_credentials(self) -> None:
        config = Config.from_env(
            {
                "OWOMIDE_ENV": "production",
                "DATA_PIPELINE_OBJECT_STORE_ENDPOINT": "objects.example.test",
                "DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY": "worker-access",
                "DATA_PIPELINE_OBJECT_STORE_SECRET_KEY": "worker-secret",
                "DATA_PIPELINE_CATALOG_SERVICE_SECRET": (
                    "production-catalog-service-secret-long-enough"
                ),
                "KAFKA_BROKERS": "kafka-1:9092,kafka-2:9092",
            },
            require_service_secrets=False,
            require_catalog_secret=True,
            require_kafka_brokers=True,
        )

        self.assertEqual(config.service_secrets, {})
        self.assertEqual(
            config.catalog_service_secret,
            "production-catalog-service-secret-long-enough",
        )
        self.assertEqual(config.kafka_brokers, ("kafka-1:9092", "kafka-2:9092"))

    def test_worker_mode_requires_outbound_catalog_credential(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env(
                {
                    "OWOMIDE_ENV": "production",
                    "DATA_PIPELINE_OBJECT_STORE_ENDPOINT": "objects.example.test",
                    "DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY": "worker-access",
                    "DATA_PIPELINE_OBJECT_STORE_SECRET_KEY": "worker-secret",
                },
                require_service_secrets=False,
                require_catalog_secret=True,
            )

    def test_worker_mode_requires_kafka_brokers_in_production(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env(
                {
                    "OWOMIDE_ENV": "production",
                    "DATA_PIPELINE_OBJECT_STORE_ENDPOINT": "objects.example.test",
                    "DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY": "worker-access",
                    "DATA_PIPELINE_OBJECT_STORE_SECRET_KEY": "worker-secret",
                    "DATA_PIPELINE_CATALOG_SERVICE_SECRET": (
                        "production-catalog-service-secret-long-enough"
                    ),
                },
                require_service_secrets=False,
                require_catalog_secret=True,
                require_kafka_brokers=True,
            )

    def test_rejects_out_of_range_ports(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env({"DATA_PIPELINE_GRPC_PORT": "70000"})

    def test_rejects_invalid_object_store_boolean(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env({"DATA_PIPELINE_OBJECT_STORE_SECURE": "sometimes"})


if __name__ == "__main__":
    unittest.main()
