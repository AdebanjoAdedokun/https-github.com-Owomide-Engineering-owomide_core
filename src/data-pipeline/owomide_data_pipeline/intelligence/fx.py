from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation, localcontext
from typing import Protocol
from uuid import UUID

from owomide_data_pipeline.intelligence.currencies import currency_code, currency_minor_unit

_RATE = re.compile(r"^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$")
_SOURCE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_I64_MIN = -(2**63)
_I64_MAX = 2**63 - 1
_RATE_QUANTUM = Decimal("0.000000000000000001")


class FxError(ValueError):
    pass


class InvalidFxRequestError(FxError):
    pass


class FxRateNotFoundError(FxError):
    pass


class FxConflictError(FxError):
    pass


@dataclass(frozen=True, slots=True)
class FxRateEntry:
    currency: str
    rate: Decimal


@dataclass(frozen=True, slots=True)
class FxRateSnapshot:
    id: UUID
    org_id: str
    idempotency_key: str
    source: str
    base_currency: str
    effective_at: datetime
    recorded_at: datetime
    rates: tuple[FxRateEntry, ...]
    provider_ref: str | None
    checksum_sha256: str
    created_by: str


@dataclass(frozen=True, slots=True)
class FxRateQuote:
    source_currency: str
    target_currency: str
    rate: Decimal
    rate_source: str
    snapshot_id: UUID | None
    effective_at: datetime
    recorded_at: datetime


@dataclass(frozen=True, slots=True)
class FxConversion:
    source_amount_minor: int
    target_amount_minor: int
    source_minor_unit: int
    target_minor_unit: int
    exact_target_amount: Decimal
    quote: FxRateQuote


class FxRateStore(Protocol):
    def record_snapshot(
        self,
        *,
        org_id: str,
        user_id: str,
        idempotency_key: str,
        source: str,
        base_currency: str,
        effective_at: datetime,
        rates: Sequence[FxRateEntry],
        provider_ref: str | None,
        checksum_sha256: str,
    ) -> tuple[FxRateSnapshot, bool]: ...

    def find_snapshot(
        self,
        *,
        org_id: str,
        source: str,
        source_currency: str,
        target_currency: str,
        effective_at: datetime,
        recorded_as_of: datetime,
        max_age_seconds: int,
    ) -> FxRateSnapshot | None: ...


def decimal_text(value: Decimal) -> str:
    rendered = format(value, "f")
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    return rendered or "0"


def _timestamp(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise InvalidFxRequestError(f"{field} must include a timezone")
    return value.astimezone(UTC)


def _currency(value: object, field: str) -> str:
    try:
        return currency_code(value, field)
    except ValueError as exc:
        raise InvalidFxRequestError(str(exc)) from exc


def _rate(value: object) -> Decimal:
    raw = str(value).strip()
    if not _RATE.fullmatch(raw):
        raise InvalidFxRequestError(
            "FX rates must be positive plain decimals with at most 18 decimal places"
        )
    try:
        result = Decimal(raw)
    except InvalidOperation as exc:
        raise InvalidFxRequestError("FX rate is invalid") from exc
    if result <= 0:
        raise InvalidFxRequestError("FX rates must be greater than zero")
    return result


def rate_source(value: object) -> str:
    if not isinstance(value, str) or not _SOURCE.fullmatch(value.strip().lower()):
        raise InvalidFxRequestError(
            "rate_source must contain 1-64 lowercase letters, numbers, dots, underscores, "
            "or hyphens"
        )
    return value.strip().lower()


def _snapshot_checksum(
    *,
    source: str,
    base_currency: str,
    effective_at: datetime,
    rates: Sequence[FxRateEntry],
    provider_ref: str | None,
) -> str:
    payload = {
        "base_currency": base_currency,
        "effective_at": effective_at.isoformat().replace("+00:00", "Z"),
        "provider_ref": provider_ref,
        "rates": [
            {"currency": entry.currency, "rate": decimal_text(entry.rate)} for entry in rates
        ],
        "source": source,
    }
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class FxCalculator:
    def __init__(self, store: FxRateStore, *, max_rate_age_seconds: int = 7 * 24 * 60 * 60) -> None:
        if not 1 <= max_rate_age_seconds <= 31 * 24 * 60 * 60:
            raise ValueError("max_rate_age_seconds must be between 1 second and 31 days")
        self._store = store
        self._max_rate_age_seconds = max_rate_age_seconds

    def record_snapshot(
        self,
        *,
        org_id: str,
        user_id: str,
        idempotency_key: str,
        source: str,
        base_currency: str,
        effective_at: datetime,
        rates: Sequence[tuple[object, object]],
        provider_ref: str | None = None,
    ) -> tuple[FxRateSnapshot, bool]:
        key = idempotency_key.strip()
        if not key or len(key) > 200:
            raise InvalidFxRequestError("idempotency_key must be between 1 and 200 characters")
        normalized_source = rate_source(source)
        base = _currency(base_currency, "base_currency")
        effective = _timestamp(effective_at, "effective_at")
        reference = provider_ref.strip() if provider_ref is not None else None
        if reference == "" or (reference is not None and len(reference) > 500):
            raise InvalidFxRequestError("provider_ref must be between 1 and 500 characters")
        if not 1 <= len(rates) <= 250:
            raise InvalidFxRequestError("An FX snapshot must contain between 1 and 250 rates")

        entries: list[FxRateEntry] = []
        seen: set[str] = set()
        for raw_currency, raw_rate in rates:
            quote_currency = _currency(raw_currency, "rate currency")
            if quote_currency == base:
                raise InvalidFxRequestError("A snapshot must not repeat its base currency")
            if quote_currency in seen:
                raise InvalidFxRequestError(f'Duplicate FX rate for currency "{quote_currency}"')
            seen.add(quote_currency)
            entries.append(FxRateEntry(quote_currency, _rate(raw_rate)))
        entries.sort(key=lambda entry: entry.currency)
        checksum = _snapshot_checksum(
            source=normalized_source,
            base_currency=base,
            effective_at=effective,
            rates=entries,
            provider_ref=reference,
        )
        return self._store.record_snapshot(
            org_id=org_id,
            user_id=user_id,
            idempotency_key=key,
            source=normalized_source,
            base_currency=base,
            effective_at=effective,
            rates=entries,
            provider_ref=reference,
            checksum_sha256=checksum,
        )

    def quote(
        self,
        *,
        org_id: str,
        source_currency: str,
        target_currency: str,
        rate_source_name: str,
        effective_at: datetime,
        recorded_as_of: datetime | None = None,
    ) -> FxRateQuote:
        source_code = _currency(source_currency, "source_currency")
        target_code = _currency(target_currency, "target_currency")
        source_name = rate_source(rate_source_name)
        effective = _timestamp(effective_at, "effective_at")
        recorded = _timestamp(recorded_as_of or datetime.now(UTC), "recorded_as_of")
        if source_code == target_code:
            return FxRateQuote(
                source_currency=source_code,
                target_currency=target_code,
                rate=Decimal(1),
                rate_source=source_name,
                snapshot_id=None,
                effective_at=effective,
                recorded_at=recorded,
            )

        snapshot = self._store.find_snapshot(
            org_id=org_id,
            source=source_name,
            source_currency=source_code,
            target_currency=target_code,
            effective_at=effective,
            recorded_as_of=recorded,
            max_age_seconds=self._max_rate_age_seconds,
        )
        if snapshot is None:
            raise FxRateNotFoundError(
                f"No {source_name} FX rate for {source_code}/{target_code} was available as of "
                f"{effective.isoformat()} and recorded by {recorded.isoformat()}"
            )
        factors: Mapping[str, Decimal] = {
            snapshot.base_currency: Decimal(1),
            **{entry.currency: entry.rate for entry in snapshot.rates},
        }
        with localcontext() as context:
            context.prec = 80
            computed = factors[target_code] / factors[source_code]
            normalized_rate = computed.quantize(_RATE_QUANTUM, rounding=ROUND_HALF_EVEN)
        if normalized_rate <= 0:
            raise InvalidFxRequestError("Resolved FX rate is below the supported precision")
        return FxRateQuote(
            source_currency=source_code,
            target_currency=target_code,
            rate=normalized_rate,
            rate_source=snapshot.source,
            snapshot_id=snapshot.id,
            effective_at=snapshot.effective_at,
            recorded_at=snapshot.recorded_at,
        )

    def convert(
        self,
        *,
        org_id: str,
        amount_minor: int,
        source_currency: str,
        target_currency: str,
        rate_source_name: str,
        effective_at: datetime,
        recorded_as_of: datetime | None = None,
    ) -> FxConversion:
        if isinstance(amount_minor, bool) or not isinstance(amount_minor, int):
            raise InvalidFxRequestError("amount_minor must be a signed 64-bit integer")
        if not _I64_MIN <= amount_minor <= _I64_MAX:
            raise InvalidFxRequestError("amount_minor must be a signed 64-bit integer")
        try:
            source_scale = currency_minor_unit(source_currency)
            target_scale = currency_minor_unit(target_currency)
        except ValueError as exc:
            raise InvalidFxRequestError(str(exc)) from exc
        quote = self.quote(
            org_id=org_id,
            source_currency=source_currency,
            target_currency=target_currency,
            rate_source_name=rate_source_name,
            effective_at=effective_at,
            recorded_as_of=recorded_as_of,
        )
        with localcontext() as context:
            context.prec = 80
            source_major = Decimal(amount_minor) / (Decimal(10) ** source_scale)
            exact_target = source_major * quote.rate
            target_minor_decimal = exact_target * (Decimal(10) ** target_scale)
            target_minor = int(target_minor_decimal.to_integral_value(rounding=ROUND_HALF_EVEN))
        if not _I64_MIN <= target_minor <= _I64_MAX:
            raise InvalidFxRequestError("Converted amount exceeds the signed 64-bit range")
        return FxConversion(
            source_amount_minor=amount_minor,
            target_amount_minor=target_minor,
            source_minor_unit=source_scale,
            target_minor_unit=target_scale,
            exact_target_amount=exact_target,
            quote=quote,
        )
