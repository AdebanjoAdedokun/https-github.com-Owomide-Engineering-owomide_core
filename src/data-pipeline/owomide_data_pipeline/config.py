from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType


class ConfigurationError(ValueError):
    """Raised when runtime configuration is invalid."""


def _integer(env: Mapping[str, str], name: str, default: int, minimum: int, maximum: int) -> int:
    raw = env.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def _positive_float(env: Mapping[str, str], name: str, default: float) -> float:
    raw = env.get(name, str(default))
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a number") from exc
    if value <= 0:
        raise ConfigurationError(f"{name} must be greater than zero")
    return value


def _service_secrets(raw: str) -> Mapping[str, str]:
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigurationError("DATA_PIPELINE_SERVICE_SECRETS_JSON must be valid JSON") from exc
    if not isinstance(decoded, dict):
        raise ConfigurationError("DATA_PIPELINE_SERVICE_SECRETS_JSON must be a JSON object")

    secrets: dict[str, str] = {}
    for service, secret in decoded.items():
        if not isinstance(service, str) or not service.strip():
            raise ConfigurationError("Service identity names must be non-empty strings")
        if not isinstance(secret, str) or len(secret) < 32:
            raise ConfigurationError(f"Service secret for {service} must be at least 32 characters")
        secrets[service] = secret
    return MappingProxyType(secrets)


@dataclass(frozen=True, slots=True)
class Config:
    database_url: str
    grpc_host: str
    grpc_port: int
    grpc_workers: int
    health_host: str
    health_port: int
    database_statement_timeout_ms: int
    service_jwt_issuer: str
    service_jwt_audience: str
    service_secrets: Mapping[str, str]
    worker_poll_seconds: float
    log_level: str

    @classmethod
    def from_env(cls, values: Mapping[str, str] | None = None) -> Config:
        env = os.environ if values is None else values
        environment = env.get("OWOMIDE_ENV", "development").strip().lower()
        database_url = env.get(
            "DATA_PIPELINE_DATABASE_URL",
            "postgresql://data_pipeline_svc:dev_data_pipeline@localhost:5432/owomide",
        ).strip()
        issuer = env.get("DATA_PIPELINE_SERVICE_JWT_ISSUER", "owomide-internal").strip()
        audience = env.get("DATA_PIPELINE_SERVICE_JWT_AUDIENCE", "data-pipeline").strip()
        secrets = _service_secrets(env.get("DATA_PIPELINE_SERVICE_SECRETS_JSON", "{}"))
        log_level = env.get("LOG_LEVEL", "INFO").strip().upper()

        if not database_url:
            raise ConfigurationError("DATA_PIPELINE_DATABASE_URL is required")
        if not issuer or not audience:
            raise ConfigurationError("Service JWT issuer and audience must be non-empty")
        if environment == "production" and not secrets:
            raise ConfigurationError("At least one service credential is required in production")
        if log_level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ConfigurationError("LOG_LEVEL is invalid")

        return cls(
            database_url=database_url,
            grpc_host=env.get("DATA_PIPELINE_GRPC_HOST", "0.0.0.0"),
            grpc_port=_integer(env, "DATA_PIPELINE_GRPC_PORT", 50_055, 1, 65_535),
            grpc_workers=_integer(env, "DATA_PIPELINE_GRPC_WORKERS", 16, 1, 128),
            health_host=env.get("DATA_PIPELINE_HEALTH_HOST", "0.0.0.0"),
            health_port=_integer(env, "DATA_PIPELINE_HEALTH_PORT", 8_080, 1, 65_535),
            database_statement_timeout_ms=_integer(
                env,
                "DATA_PIPELINE_DATABASE_STATEMENT_TIMEOUT_MS",
                15_000,
                100,
                600_000,
            ),
            service_jwt_issuer=issuer,
            service_jwt_audience=audience,
            service_secrets=secrets,
            worker_poll_seconds=_positive_float(env, "DATA_PIPELINE_WORKER_POLL_SECONDS", 2.0),
            log_level=log_level,
        )
