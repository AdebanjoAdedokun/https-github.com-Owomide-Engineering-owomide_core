from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, date, datetime

from common.v1 import common_pb2
from google.protobuf.timestamp_pb2 import Timestamp
from services.catalog.v1 import catalog_pb2

from owomide_data_pipeline.errors import InvalidImportError


def _object(value: object, field: str) -> Mapping[str, object] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise InvalidImportError(f"{field} must be an object")
    return value


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _minor_units(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise InvalidImportError(f"{field} must be a non-negative integer in minor units")
    return value


def _timestamp(value: object, field: str) -> Timestamp:
    raw = _text(value)
    if raw is None:
        raise InvalidImportError(f"{field} is required")
    try:
        if len(raw) == 10:
            parsed = datetime.combine(date.fromisoformat(raw), datetime.min.time(), tzinfo=UTC)
        else:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            parsed = parsed.astimezone(UTC)
    except ValueError as exc:
        raise InvalidImportError(f"{field} must be an ISO 8601 timestamp") from exc
    result = Timestamp()
    result.FromDatetime(parsed)
    return result


def _optional_timestamp(value: object, field: str) -> Timestamp | None:
    return None if value is None or _text(value) is None else _timestamp(value, field)


def _money(record: Mapping[str, object], amount_field: str, prefix: str) -> common_pb2.Money:
    currency = _text(record.get("currency"))
    if currency is None:
        raise InvalidImportError(f"{prefix}.currency is required")
    return common_pb2.Money(
        amount=_minor_units(record.get(amount_field), f"{prefix}.{amount_field}"),
        currency=currency.upper(),
    )


def _identity(sku: Mapping[str, object]) -> catalog_pb2.SkuIdentity:
    sku_id = _text(sku.get("sku_id"))
    if sku_id:
        return catalog_pb2.SkuIdentity(sku_id=sku_id)
    sku_code = _text(sku.get("sku_code"))
    if sku_code:
        return catalog_pb2.SkuIdentity(sku_code=sku_code)
    identifier_type = _text(sku.get("identifier_type"))
    identifier = _text(sku.get("identifier"))
    if identifier_type and identifier:
        return catalog_pb2.SkuIdentity(
            identifier=catalog_pb2.IdentifierReference(
                type=identifier_type,
                namespace=_text(sku.get("identifier_namespace")),
                value=identifier,
            )
        )
    raise InvalidImportError("sku requires a SKU ID, SKU code, or typed identifier")


def _new_sku(sku: Mapping[str, object]) -> catalog_pb2.NewSku | None:
    sku_code = _text(sku.get("sku_code"))
    if sku_code is None:
        return None
    pack_size = sku.get("pack_size")
    if pack_size is not None and (
        isinstance(pack_size, bool) or not isinstance(pack_size, int) or pack_size <= 0
    ):
        raise InvalidImportError("sku.pack_size must be a positive integer")
    attributes = sku.get("attributes", {})
    if not isinstance(attributes, Mapping):
        raise InvalidImportError("sku.attributes must be an object")
    result = catalog_pb2.NewSku(
        sku_code=sku_code,
        product_id=_text(sku.get("product_id")),
        pack_size=pack_size,
        unit=_text(sku.get("unit")),
        attributes_json=json.dumps(attributes, sort_keys=True, separators=(",", ":")),
    )
    identifier_type = _text(sku.get("identifier_type"))
    identifier = _text(sku.get("identifier"))
    if identifier_type and identifier:
        result.identifiers.append(
            catalog_pb2.NewSkuIdentifier(
                type=identifier_type,
                namespace=_text(sku.get("identifier_namespace")),
                value=identifier,
                is_primary=True,
            )
        )
    return result


def canonical_row(
    *,
    row_id: str,
    mapped_data: Mapping[str, object],
) -> catalog_pb2.CanonicalWriteRow:
    sku = _object(mapped_data.get("sku"), "sku")
    if sku is None:
        raise InvalidImportError("sku is required")
    result = catalog_pb2.CanonicalWriteRow(
        source_item_ref=row_id,
        sku_identity=_identity(sku),
    )
    new_sku = _new_sku(sku)
    if new_sku is not None:
        result.new_sku.CopyFrom(new_sku)

    cost = _object(mapped_data.get("cost_record"), "cost_record")
    if cost is not None:
        cost_write = catalog_pb2.CostWrite(
            location_id=_text(cost.get("location_id")),
            cost_type=_text(cost.get("cost_type")) or "standard",
            cost=_money(cost, "cost_minor", "cost_record"),
            effective_at=_timestamp(cost.get("effective_at"), "cost_record.effective_at"),
        )
        effective_until = _optional_timestamp(
            cost.get("effective_until"), "cost_record.effective_until"
        )
        if effective_until is not None:
            cost_write.effective_until.CopyFrom(effective_until)
        result.cost.CopyFrom(cost_write)

    price = _object(mapped_data.get("price_record"), "price_record")
    if price is not None:
        channel_id = _text(price.get("channel_id"))
        if channel_id is None:
            raise InvalidImportError("price_record.channel_id is required")
        price_write = catalog_pb2.PriceWrite(
            channel_id=channel_id,
            location_id=_text(price.get("location_id")),
            customer_segment_id=_text(price.get("customer_segment_id")),
            price=_money(price, "price_minor", "price_record"),
            effective_at=_timestamp(price.get("effective_at"), "price_record.effective_at"),
        )
        effective_until = _optional_timestamp(
            price.get("effective_until"), "price_record.effective_until"
        )
        if effective_until is not None:
            price_write.effective_until.CopyFrom(effective_until)
        result.prices.append(price_write)

    if cost is None and price is None:
        raise InvalidImportError("row contains neither a price nor a cost record")
    return result
