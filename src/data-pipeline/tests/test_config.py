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
                "DATA_PIPELINE_SERVICE_SECRETS_JSON": (
                    '{"gateway_svc":"a-development-secret-that-is-long-enough"}'
                ),
            }
        )

        self.assertEqual(config.grpc_port, 50_123)
        self.assertEqual(config.grpc_workers, 8)
        self.assertEqual(config.worker_poll_seconds, 0.25)
        with self.assertRaises(TypeError):
            config.service_secrets["other"] = "not allowed"  # type: ignore[index]

    def test_rejects_invalid_secret_documents(self) -> None:
        for raw in ("not-json", "[]", '{"gateway_svc":"short"}'):
            with self.subTest(raw=raw), self.assertRaises(ConfigurationError):
                Config.from_env({"DATA_PIPELINE_SERVICE_SECRETS_JSON": raw})

    def test_production_fails_closed_without_service_credentials(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env({"OWOMIDE_ENV": "production"})

    def test_rejects_out_of_range_ports(self) -> None:
        with self.assertRaises(ConfigurationError):
            Config.from_env({"DATA_PIPELINE_GRPC_PORT": "70000"})


if __name__ == "__main__":
    unittest.main()
