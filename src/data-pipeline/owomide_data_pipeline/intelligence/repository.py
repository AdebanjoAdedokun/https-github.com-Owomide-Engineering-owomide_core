from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from owomide_data_pipeline.db import Database
from owomide_data_pipeline.intelligence.fx import (
    FxConflictError,
    FxRateEntry,
    FxRateSnapshot,
)


def _snapshot(row: dict[str, Any], rates: Sequence[dict[str, Any]]) -> FxRateSnapshot:
    return FxRateSnapshot(
        id=row["id"],
        org_id=row["org_id"],
        idempotency_key=row["idempotency_key"],
        source=row["source"],
        base_currency=row["base_currency"],
        effective_at=row["effective_at"],
        recorded_at=row["recorded_at"],
        rates=tuple(
            FxRateEntry(entry["quote_currency"], Decimal(entry["rate"])) for entry in rates
        ),
        provider_ref=row["provider_ref"],
        checksum_sha256=row["checksum_sha256"],
        created_by=row["created_by"],
    )


class FxRateRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    @staticmethod
    def _load_snapshot(connection, snapshot_id: UUID) -> FxRateSnapshot:
        row = connection.execute(
            "SELECT * FROM data_pipeline.fx_rate_snapshot WHERE id = %s",
            (snapshot_id,),
        ).fetchone()
        if row is None:
            raise RuntimeError("FX rate snapshot disappeared")
        rates = connection.execute(
            "SELECT quote_currency, rate FROM data_pipeline.fx_rate_entry "
            "WHERE snapshot_id = %s ORDER BY quote_currency",
            (snapshot_id,),
        ).fetchall()
        return _snapshot(row, rates)

    def record_snapshot(
        self,
        *,
        org_id: str,
        user_id: str,
        idempotency_key: str,
        source: str,
        base_currency: str,
        effective_at,
        rates: Sequence[FxRateEntry],
        provider_ref: str | None,
        checksum_sha256: str,
    ) -> tuple[FxRateSnapshot, bool]:
        with self._database.transaction(org_id) as connection:
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (f"{org_id}:fx:{idempotency_key}",),
            )
            existing = connection.execute(
                "SELECT id, checksum_sha256 FROM data_pipeline.fx_rate_snapshot "
                "WHERE org_id = %s AND idempotency_key = %s",
                (org_id, idempotency_key),
            ).fetchone()
            if existing is not None:
                if existing["checksum_sha256"] != checksum_sha256:
                    raise FxConflictError(
                        "idempotency_key was already used for a different FX snapshot"
                    )
                return self._load_snapshot(connection, existing["id"]), True

            snapshot_id = uuid4()
            connection.execute(
                """
                INSERT INTO data_pipeline.fx_rate_snapshot (
                    id, org_id, idempotency_key, source, base_currency, effective_at,
                    provider_ref, checksum_sha256, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    snapshot_id,
                    org_id,
                    idempotency_key,
                    source,
                    base_currency,
                    effective_at,
                    provider_ref,
                    checksum_sha256,
                    user_id,
                ),
            )
            with connection.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO data_pipeline.fx_rate_entry "
                    "(org_id, snapshot_id, quote_currency, rate) VALUES (%s, %s, %s, %s)",
                    [(org_id, snapshot_id, entry.currency, entry.rate) for entry in rates],
                )
            return self._load_snapshot(connection, snapshot_id), False

    def find_snapshot(
        self,
        *,
        org_id: str,
        source: str,
        source_currency: str,
        target_currency: str,
        effective_at,
        recorded_as_of,
        max_age_seconds: int,
    ) -> FxRateSnapshot | None:
        with self._database.transaction(org_id) as connection:
            candidate = connection.execute(
                """
                SELECT snapshot.id
                FROM data_pipeline.fx_rate_snapshot AS snapshot
                LEFT JOIN data_pipeline.fx_rate_entry AS source_rate
                  ON source_rate.org_id = snapshot.org_id
                 AND source_rate.snapshot_id = snapshot.id
                 AND source_rate.quote_currency = %s
                LEFT JOIN data_pipeline.fx_rate_entry AS target_rate
                  ON target_rate.org_id = snapshot.org_id
                 AND target_rate.snapshot_id = snapshot.id
                 AND target_rate.quote_currency = %s
                WHERE snapshot.org_id = %s
                  AND snapshot.source = %s
                  AND snapshot.effective_at <= %s
                  AND snapshot.effective_at >= %s
                  AND snapshot.recorded_at <= %s
                  AND (snapshot.base_currency = %s OR source_rate.rate IS NOT NULL)
                  AND (snapshot.base_currency = %s OR target_rate.rate IS NOT NULL)
                ORDER BY snapshot.effective_at DESC, snapshot.recorded_at DESC, snapshot.id DESC
                LIMIT 1
                """,
                (
                    source_currency,
                    target_currency,
                    org_id,
                    source,
                    effective_at,
                    effective_at - timedelta(seconds=max_age_seconds),
                    recorded_as_of,
                    source_currency,
                    target_currency,
                ),
            ).fetchone()
            if candidate is None:
                return None
            return self._load_snapshot(connection, candidate["id"])
