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


def _boolean(env: Mapping[str, str], name: str, default: bool) -> bool:
    raw = env.get(name, str(default)).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ConfigurationError(f"{name} must be a boolean")


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
    object_store_endpoint: str
    object_store_access_key: str
    object_store_secret_key: str
    object_store_secure: bool
    object_store_bucket: str
    catalog_service_url: str
    catalog_service_secret: str
    catalog_timeout_seconds: float
    upload_max_bytes: int
    import_max_rows: int
    import_max_columns: int
    import_insert_batch_size: int
    worker_lease_seconds: int
    worker_retry_base_seconds: int
    xlsx_spool_memory_bytes: int
    worker_poll_seconds: float
    log_level: str

    @classmethod
    def from_env(
        cls,
        values: Mapping[str, str] | None = None,
        *,
        require_service_secrets: bool = True,
        require_catalog_secret: bool = False,
    ) -> Config:
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
        object_store_endpoint = env.get(
            "DATA_PIPELINE_OBJECT_STORE_ENDPOINT",
            "" if environment == "production" else "localhost:9000",
        ).strip()
        object_store_access_key = env.get(
            "DATA_PIPELINE_OBJECT_STORE_ACCESS_KEY",
            "" if environment == "production" else "minioadmin",
        ).strip()
        object_store_secret_key = env.get(
            "DATA_PIPELINE_OBJECT_STORE_SECRET_KEY",
            "" if environment == "production" else "minioadmin",
        ).strip()
        object_store_bucket = env.get(
            "DATA_PIPELINE_OBJECT_STORE_BUCKET", "owomide-imports"
        ).strip()
        catalog_service_url = env.get(
            "DATA_PIPELINE_CATALOG_SERVICE_URL", "localhost:50052"
        ).strip()
        catalog_service_secret = env.get(
            "DATA_PIPELINE_CATALOG_SERVICE_SECRET",
            "" if environment == "production" else "dev-only-catalog-pipeline-secret-change-me",
        ).strip()

        if not database_url:
            raise ConfigurationError("DATA_PIPELINE_DATABASE_URL is required")
        if not issuer or not audience:
            raise ConfigurationError("Service JWT issuer and audience must be non-empty")
        if environment == "production" and require_service_secrets and not secrets:
            raise ConfigurationError("At least one service credential is required in production")
        if not object_store_endpoint or not object_store_access_key or not object_store_secret_key:
            raise ConfigurationError("Object store endpoint and credentials are required")
        if not object_store_bucket:
            raise ConfigurationError("DATA_PIPELINE_OBJECT_STORE_BUCKET is required")
        if not catalog_service_url:
            raise ConfigurationError("DATA_PIPELINE_CATALOG_SERVICE_URL is required")
        if require_catalog_secret and len(catalog_service_secret) < 32:
            raise ConfigurationError(
                "DATA_PIPELINE_CATALOG_SERVICE_SECRET must be at least 32 characters"
            )
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
            object_store_endpoint=object_store_endpoint,
            object_store_access_key=object_store_access_key,
            object_store_secret_key=object_store_secret_key,
            object_store_secure=_boolean(env, "DATA_PIPELINE_OBJECT_STORE_SECURE", False),
            object_store_bucket=object_store_bucket,
            catalog_service_url=catalog_service_url,
            catalog_service_secret=catalog_service_secret,
            catalog_timeout_seconds=_positive_float(
                env, "DATA_PIPELINE_CATALOG_TIMEOUT_SECONDS", 10.0
            ),
            upload_max_bytes=_integer(
                env, "DATA_PIPELINE_UPLOAD_MAX_BYTES", 50 * 1024 * 1024, 1, 5 * 1024 * 1024 * 1024
            ),
            import_max_rows=_integer(env, "DATA_PIPELINE_IMPORT_MAX_ROWS", 250_000, 1, 5_000_000),
            import_max_columns=_integer(env, "DATA_PIPELINE_IMPORT_MAX_COLUMNS", 500, 1, 10_000),
            import_insert_batch_size=_integer(
                env, "DATA_PIPELINE_IMPORT_INSERT_BATCH_SIZE", 1_000, 1, 10_000
            ),
            worker_lease_seconds=_integer(
                env, "DATA_PIPELINE_WORKER_LEASE_SECONDS", 300, 10, 3_600
            ),
            worker_retry_base_seconds=_integer(
                env, "DATA_PIPELINE_WORKER_RETRY_BASE_SECONDS", 5, 1, 3_600
            ),
            xlsx_spool_memory_bytes=_integer(
                env,
                "DATA_PIPELINE_XLSX_SPOOL_MEMORY_BYTES",
                8 * 1024 * 1024,
                1024 * 1024,
                128 * 1024 * 1024,
            ),
            worker_poll_seconds=_positive_float(env, "DATA_PIPELINE_WORKER_POLL_SECONDS", 2.0),
            log_level=log_level,
        )
