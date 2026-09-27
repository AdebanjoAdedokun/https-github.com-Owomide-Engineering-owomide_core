from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from owomide_data_pipeline.catalog import CatalogSnapshot, ChannelReference
from owomide_data_pipeline.profiler import CURRENCY_CODES
from owomide_data_pipeline.transformations import (
    TransformationError,
    cost_unit_code,
    parse_date,
    parse_tax_flag,
    percent_to_basis_points,
)


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


def _validate_tax_basis(
    price: dict[str, object],
    snapshot: CatalogSnapshot,
    row_number: int,
    findings: list[ValidationFinding],
) -> tuple[bool | None, int | None]:
    """Normalise the row's tax basis (DATA-022, ADR-016) and return the basis that will apply.

    Stores `tax_inclusive` as a boolean and `tax_rate_bp` as basis points (7.5% -> 750). A row
    without a flag takes the organisation default when Catalog writes it; when no default is
    known the price is stored without a basis and no margin can be calculated from it.
    """
    inclusive: bool | None = None
    flag = price.get("tax_inclusive")
    if flag not in (None, ""):
        try:
            inclusive = parse_tax_flag(flag)
            price["tax_inclusive"] = inclusive
        except TransformationError:
            _finding(
                findings,
                row_number=row_number,
                severity="error",
                code="invalid_tax_flag",
                message='field "price_record.tax_inclusive" is not a recognised yes/no value.',
                field="price_record.tax_inclusive",
                raw_value=flag,
                suggested_fix='Use values such as "inclusive"/"exclusive" or "yes"/"no".',
            )
            return None, None
    else:
        price.pop("tax_inclusive", None)

    rate_bp: int | None = None
    raw_rate = price.pop("tax_rate_pct", None)
    if raw_rate not in (None, ""):
        try:
            rate_bp = percent_to_basis_points(raw_rate)
        except TransformationError as exc:
            _finding(
                findings,
                row_number=row_number,
                severity="error",
                code="invalid_tax_rate",
                message=f'field "price_record.tax_rate_pct" is invalid: {exc}.',
                field="price_record.tax_rate_pct",
                raw_value=raw_rate,
                suggested_fix="Give the rate as a percentage such as 7.5.",
            )
            return None, None

    if inclusive is None:
        # A rate on its own cannot be stored (Catalog requires a basis with a rate).
        if snapshot.default_tax_inclusive is None:
            # Information, not a warning: Catalog applies the organisation default when it
            # writes the price, and the pipeline cannot see that default yet (ADR-016).
            _finding(
                findings,
                row_number=row_number,
                severity="info",
                code="tax_basis_missing",
                message=(
                    "the file does not say whether this price includes VAT. The organisation "
                    "default applies if one is set; otherwise no margin can be calculated from it."
                ),
                field="price_record.tax_inclusive",
                suggested_fix="Map a VAT-inclusive column or set the organisation's default.",
            )
            return None, None
        inclusive = snapshot.default_tax_inclusive
        if rate_bp is None:
            # Leave the row silent: Catalog stamps the default flag and rate together.
            rate_bp = snapshot.default_tax_rate_bp
        else:
            # The file states a rate, so state the (default) basis alongside it.
            price["tax_inclusive"] = inclusive
            price["tax_rate_bp"] = rate_bp
    elif rate_bp is not None:
        price["tax_rate_bp"] = rate_bp
    if inclusive and rate_bp is None:
        _finding(
            findings,
            row_number=row_number,
            severity="warning",
            code="tax_rate_missing_for_inclusive_price",
            message="the price includes VAT but no VAT rate is known, so VAT cannot be removed.",
            field="price_record.tax_rate_pct",
            suggested_fix="Map a VAT rate column or set the organisation's default rate.",
        )
    return inclusive, rate_bp


def _validate_cost_unit(
    cost: dict[str, object],
    sku: Mapping[str, object],
    row_number: int,
    findings: list[ValidationFinding],
) -> None:
    raw_unit = cost.get("unit")
    if raw_unit in (None, ""):
        cost.pop("unit", None)
        return
    try:
        unit = cost_unit_code(raw_unit)
    except TransformationError as exc:
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="invalid_cost_unit",
            message=f'field "cost_record.unit" is invalid: {exc}.',
            field="cost_record.unit",
            raw_value=raw_unit,
            suggested_fix='Use a unit such as "each", "carton" or "kg".',
        )
        return
    cost["unit"] = unit
    sku_unit = _text(sku.get("unit"))
    if sku_unit is not None:
        try:
            comparable = cost_unit_code(sku_unit)
        except TransformationError:
            comparable = None
        if comparable != unit:
            _finding(
                findings,
                row_number=row_number,
                severity="warning",
                code="cost_unit_incompatible",
                message=(
                    f'cost is per "{unit}" but the SKU is sold per "{sku_unit}", so this cost is '
                    "kept as context and not used for margins."
                ),
                field="cost_record.unit",
                raw_value=raw_unit,
                suggested_fix="Convert the cost to the selling unit or correct the unit.",
            )


def _below_cost(price_minor: int, inclusive: bool | None, rate_bp: int | None, cost: int) -> bool:
    """True when the price, with VAT removed, is below cost (decision D-04: margins on VAT-
    exclusive prices). Exact integer comparison: price * 10000 / (10000 + rate) < cost.

    When the basis or the rate is unknown the price is compared as written. Removing VAT can
    only lower a price, so a price below cost as written is below cost on any basis."""
    if inclusive and rate_bp is not None:
        return price_minor * 10_000 < cost * (10_000 + rate_bp)
    return price_minor < cost


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
    price_tax_inclusive: bool | None = None
    price_tax_rate_bp: int | None = None
    channel: ChannelReference | None = None
    if price is not None:
        price_tax_inclusive, price_tax_rate_bp = _validate_tax_basis(
            price, snapshot, row_number, findings
        )
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
        _validate_cost_unit(cost, sku, row_number, findings)
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
        and _below_cost(price_amount, price_tax_inclusive, price_tax_rate_bp, comparison_cost)
    ):
        _finding(
            findings,
            row_number=row_number,
            severity="error",
            code="below_cost",
            message=(
                f"price {price_amount} is below known cost {comparison_cost} minor units"
                + (
                    " once VAT is removed."
                    if price_tax_inclusive and price_tax_rate_bp is not None
                    else "."
                )
            ),
            field="price_record.price_minor",
            raw_value=price_amount,
            suggested_fix="Increase the price, correct the cost, or exclude the row.",
        )

    return mapped_data, tuple(findings)
