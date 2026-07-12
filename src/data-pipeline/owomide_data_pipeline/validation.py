from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from owomide_data_pipeline.catalog import CatalogSnapshot, ChannelReference
from owomide_data_pipeline.profiler import CURRENCY_CODES
from owomide_data_pipeline.transformations import TransformationError, parse_date


@dataclass(frozen=True, slots=True)
class ValidationFinding:
    severity: str
    code: str
    message: str
    field: str | None = None
    raw_value: str | None = None
    suggested_fix: str | None = None


def _display(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        result = value
    else:
        result = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return result[:500]


def _object(document: Mapping[str, object], key: str) -> dict[str, object] | None:
    value = document.get(key)
    return value if isinstance(value, dict) else None


def _text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _minor_units(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and -(2**63) <= value < 2**63:
        return value
    return None


def _valid_uuid(value: str) -> bool:
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def _finding(
    findings: list[ValidationFinding],
    *,
    row_number: int,
    severity: str,
    code: str,
    message: str,
    field: str | None = None,
    raw_value: object = None,
    suggested_fix: str | None = None,
) -> None:
    findings.append(
        ValidationFinding(
            severity=severity,
            code=code,
            message=f"Row {row_number}: {message}",
            field=field,
            raw_value=_display(raw_value),
            suggested_fix=suggested_fix,
        )
    )


def _validate_currency(
    record: dict[str, object],
    record_name: str,
    row_number: int,
    findings: list[ValidationFinding],
) -> str | None:
    field = f"{record_name}.currency"
    currency = _text(record.get("currency"))
    if currency is None or not re.fullmatch(r"[A-Za-z]{3}", currency):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="invalid_currency",
            message=f'field "{field}" must contain a three-letter ISO 4217 code.',
            field=field,
            raw_value=record.get("currency"),
            suggested_fix="Map a currency column or supply a three-letter currency code.",
        )
        return None
    currency = currency.upper()
    if currency not in CURRENCY_CODES:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="invalid_currency",
            message=f'currency "{currency}" is not supported.',
            field=field,
            raw_value=currency,
            suggested_fix="Use a supported active ISO 4217 currency code.",
        )
        return None
    record["currency"] = currency
    return currency


def _validate_date(
    record: dict[str, object],
    record_name: str,
    row_number: int,
    findings: list[ValidationFinding],
) -> datetime | None:
    field = f"{record_name}.effective_at"
    value = record.get("effective_at")
    try:
        normalized = parse_date(value)
        record["effective_at"] = normalized
        start = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except (TransformationError, ValueError):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="invalid_effective_date",
            message=f'field "{field}" is missing or invalid.',
            field=field,
            raw_value=value,
            suggested_fix="Provide an ISO-8601 date or configure an explicit date transformation.",
        )
        return None

    until = record.get("effective_until")
    if until not in (None, ""):
        try:
            normalized_until = parse_date(until)
            end = datetime.fromisoformat(normalized_until.replace("Z", "+00:00"))
            if end <= start:
                raise TransformationError("end must be after start")
            record["effective_until"] = normalized_until
        except (TransformationError, ValueError):
            _finding(
                findings,
                row_number=row_number,
                severity="error",
                code="invalid_effective_date",
                message=f'field "{record_name}.effective_until" must be after effective_at.',
                field=f"{record_name}.effective_until",
                raw_value=until,
                suggested_fix="Provide an end date after the effective date or leave it empty.",
            )
    return start


def _resolve_channel(
    mapped_data: dict[str, object],
    price: dict[str, object],
    batch_channel_id: str | None,
    snapshot: CatalogSnapshot,
    row_number: int,
    findings: list[ValidationFinding],
) -> ChannelReference | None:
    channel_id = _text(price.get("channel_id")) or batch_channel_id
    channel_code = _text((_object(mapped_data, "channel") or {}).get("code"))
    channel = snapshot.channels_by_id.get(channel_id) if channel_id else None
    if channel_id and channel is None:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="cross_org_reference",
            message="channel_id is not an active channel in this organization.",
            field="price_record.channel_id",
            raw_value=channel_id,
            suggested_fix="Select an active channel owned by this organization.",
        )
        return None
    if channel is None and channel_code:
        channel = snapshot.channels_by_code.get(channel_code.upper())
    if channel is None:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="unknown_channel",
            message="no active Catalog channel matches this row.",
            field="channel.code" if channel_code else "price_record.channel_id",
            raw_value=channel_code,
            suggested_fix="Map an existing channel code or select a batch channel.",
        )
        return None
    price["channel_id"] = channel.id
    return channel


def _validate_reference(
    record: dict[str, object],
    key: str,
    allowed: frozenset[str],
    field: str,
    row_number: int,
    findings: list[ValidationFinding],
) -> None:
    value = _text(record.get(key))
    if value and (not _valid_uuid(value) or value not in allowed):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="cross_org_reference",
            message=f'field "{field}" is not an active reference in this organization.',
            field=field,
            raw_value=value,
            suggested_fix="Select an active reference owned by this organization.",
        )


def validate_row(
    mapped_data: dict[str, object],
    *,
    row_number: int,
    batch_channel_id: str | None,
    batch_customer_segment_id: str | None,
    snapshot: CatalogSnapshot,
    transformation_failures: Sequence[tuple[str, str, object]],
) -> tuple[dict[str, object], tuple[ValidationFinding, ...]]:
    findings: list[ValidationFinding] = []
    for field, message, rule_type in transformation_failures:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="transformation_failed",
            message=f'{rule_type} failed for "{field}": {message}.',
            field=field,
            suggested_fix="Correct the source value or update the mapping transformation.",
        )

    sku = _object(mapped_data, "sku") or {}
    sku_id = _text(sku.get("sku_id"))
    sku_code = _text(sku.get("sku_code"))
    identifier = _text(sku.get("identifier"))
    identifier_type = _text(sku.get("identifier_type"))
    if not sku_id and not sku_code and not (identifier and identifier_type):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="missing_sku_identity",
            message="no usable SKU ID, SKU code, or typed identifier was mapped.",
            field="sku",
            suggested_fix="Map a SKU code, SKU ID, or identifier plus identifier type.",
        )
    elif sku_id and (not _valid_uuid(sku_id) or sku_id not in snapshot.sku_ids):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="cross_org_reference",
            message="sku_id does not identify an active SKU in this organization.",
            field="sku.sku_id",
            raw_value=sku_id,
            suggested_fix="Use an existing organization SKU or map a new SKU code instead.",
        )

    price = _object(mapped_data, "price_record")
    cost = _object(mapped_data, "cost_record")
    if price is None and cost is None:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="invalid_price",
            message="row contains neither a price record nor a cost record.",
            field="price_record.price_minor",
            suggested_fix="Map a price or cost amount, or exclude this row.",
        )

    price_amount: int | None = None
    price_currency: str | None = None
    channel: ChannelReference | None = None
    if price is not None:
        price_amount = _minor_units(price.get("price_minor"))
        if price_amount is None or price_amount < 0:
            _finding(
                findings,
                row_number=row_number,
                severity="error",
                code="invalid_price",
                message="price must be a non-negative integer in minor units.",
                field="price_record.price_minor",
                raw_value=price.get("price_minor"),
                suggested_fix="Apply money parsing and decimal-to-minor-units transformations.",
            )
        price_currency = _validate_currency(price, "price_record", row_number, findings)
        _validate_date(price, "price_record", row_number, findings)
        channel = _resolve_channel(
            mapped_data,
            price,
            batch_channel_id,
            snapshot,
            row_number,
            findings,
        )
        if channel and price_currency and channel.default_currency != price_currency:
            _finding(
                findings,
                row_number=row_number,
                severity="warning",
                code="currency_channel_mismatch",
                message=(
                    f'currency "{price_currency}" differs from channel '
                    f'default "{channel.default_currency}".'
                ),
                field="price_record.currency",
                raw_value=price_currency,
                suggested_fix="Confirm the currency or convert it using an explicit rate.",
            )
        if batch_customer_segment_id and not _text(price.get("customer_segment_id")):
            price["customer_segment_id"] = batch_customer_segment_id
        _validate_reference(
            price,
            "location_id",
            snapshot.location_ids,
            "price_record.location_id",
            row_number,
            findings,
        )
        _validate_reference(
            price,
            "customer_segment_id",
            snapshot.segment_ids,
            "price_record.customer_segment_id",
            row_number,
            findings,
        )

    cost_amount: int | None = None
    cost_currency: str | None = None
    if cost is None and price is not None:
        _finding(
            findings,
            row_number=row_number,
            severity="warning",
            code="invalid_cost",
            message="no row cost is available for margin validation.",
            field="cost_record.cost_minor",
            suggested_fix="Map a cost column if margin checks are required.",
        )
    elif cost is not None:
        cost_amount = _minor_units(cost.get("cost_minor"))
        if cost_amount is None or cost_amount < 0:
            _finding(
                findings,
                row_number=row_number,
                severity="error",
                code="invalid_cost",
                message="cost must be a non-negative integer in minor units.",
                field="cost_record.cost_minor",
                raw_value=cost.get("cost_minor"),
                suggested_fix="Apply money parsing and decimal-to-minor-units transformations.",
            )
        cost_currency = _validate_currency(cost, "cost_record", row_number, findings)
        _validate_date(cost, "cost_record", row_number, findings)
        _validate_reference(
            cost,
            "location_id",
            snapshot.location_ids,
            "cost_record.location_id",
            row_number,
            findings,
        )

    known_cost = None
    if sku_id and sku_id in snapshot.sku_ids:
        location_id = _text((price or {}).get("location_id"))
        known_cost = snapshot.costs.get((sku_id, location_id)) or snapshot.costs.get((sku_id, None))
    comparison_cost = cost_amount
    comparison_currency = cost_currency
    if comparison_cost is None and known_cost is not None:
        comparison_cost = known_cost.amount
        comparison_currency = known_cost.currency
    if (
        price_amount is not None
        and price_amount >= 0
        and comparison_cost is not None
        and price_currency
        and comparison_currency == price_currency
        and price_amount < comparison_cost
    ):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="below_cost",
            message=f"price {price_amount} is below known cost {comparison_cost} minor units.",
            field="price_record.price_minor",
            raw_value=price_amount,
            suggested_fix="Increase the price, correct the cost, or exclude the row.",
        )

    return mapped_data, tuple(findings)
