from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.intelligence.currencies import currency_code, currency_minor_unit
from owomide_data_pipeline.intelligence.fx import InvalidFxRequestError, rate_source

MAX_MAPPING_FIELDS = 10_000
MAX_TRANSFORMATION_RULES = 10_000
MAX_CONFIG_BYTES = 1_000_000

# These paths form the staging contract consumed by F2.5 validation and F2.6 Catalog commit.
CANONICAL_TARGETS = frozenset(
    {
        "channel.code",
        "cost_record.cost_minor",
        "cost_record.cost_type",
        "cost_record.currency",
        "cost_record.effective_at",
        "cost_record.effective_until",
        "cost_record.location_id",
        "cost_record.tax_inclusive",
        "price_record.channel_id",
        "price_record.currency",
        "price_record.customer_segment_id",
        "price_record.effective_at",
        "price_record.effective_until",
        "price_record.location_id",
        "price_record.price_minor",
        "price_record.tax_inclusive",
        "product.name",
        "sku.identifier",
        "sku.identifier_namespace",
        "sku.identifier_type",
        "sku.pack_size",
        "sku.product_id",
        "sku.sku_code",
        "sku.sku_id",
        "sku.unit",
    }
)

TRANSFORMATION_TYPES = frozenset(
    {
        "currency_convert_explicit",
        "currency_convert",
        "date_parse",
        "decimal_to_minor_units",
        "money_parse",
        "pack_size_normalize",
        "tax_flag",
        "unit_normalize",
    }
)


def _decode(raw: str, field: str) -> Any:
    if not raw or len(raw.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise InvalidImportError(f"{field} must be non-empty JSON under {MAX_CONFIG_BYTES} bytes")

    def object_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise InvalidImportError(f'{field} contains duplicate key "{key}"')
            result[key] = value
        return result

    def invalid_constant(constant: str) -> None:
        raise InvalidImportError(f'{field} contains non-standard number "{constant}"')

    try:
        return json.loads(
            raw,
            object_pairs_hook=object_pairs,
            parse_constant=invalid_constant,
        )
    except json.JSONDecodeError as exc:
        raise InvalidImportError(f"{field} must be valid JSON") from exc


def validate_mappings(value: object) -> dict[str, str]:
    if not isinstance(value, dict) or not value:
        raise InvalidImportError("mappings_json must be a non-empty JSON object")
    if len(value) > MAX_MAPPING_FIELDS:
        raise InvalidImportError(f"Mapping exceeds the limit of {MAX_MAPPING_FIELDS} fields")

    mappings: dict[str, str] = {}
    targets: set[str] = set()
    for source, target in value.items():
        if not isinstance(source, str) or not source.strip() or len(source) > 255:
            raise InvalidImportError("Mapping source fields must be non-empty strings")
        if not isinstance(target, str):
            raise InvalidImportError(f'Mapping target for "{source}" must be a string')
        normalized_target = target.strip()
        if normalized_target not in CANONICAL_TARGETS:
            raise InvalidImportError(
                f'Mapping target "{normalized_target}" is not a supported canonical field'
            )
        if normalized_target in targets:
            raise InvalidImportError(
                f'Mapping target "{normalized_target}" is assigned more than once'
            )
        mappings[source] = normalized_target
        targets.add(normalized_target)
    return mappings


def parse_mappings_json(raw: str) -> dict[str, str]:
    return validate_mappings(_decode(raw, "mappings_json"))


def validate_transformation_rules(
    value: object,
    mappings: Mapping[str, str],
) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise InvalidImportError("transformation_rules_json must be a JSON array")
    if len(value) > MAX_TRANSFORMATION_RULES:
        raise InvalidImportError(
            f"Transformation rules exceed the limit of {MAX_TRANSFORMATION_RULES}"
        )

    rules: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    positions: dict[tuple[str, str], int] = {}
    conversion_fields: set[str] = set()
    minor_unit_fields: set[str] = set()
    dynamic_conversions: dict[str, tuple[int, str, int]] = {}
    for index, rule in enumerate(value, start=1):
        if not isinstance(rule, dict):
            raise InvalidImportError(f"Transformation rule {index} must be a JSON object")
        field = rule.get("field")
        rule_type = rule.get("type")
        if not isinstance(field, str) or field not in mappings:
            raise InvalidImportError(
                f"Transformation rule {index} must reference a mapped source field"
            )
        if not isinstance(rule_type, str) or rule_type not in TRANSFORMATION_TYPES:
            raise InvalidImportError(f"Transformation rule {index} has an unsupported type")
        if rule_type == "currency_convert":
            amount_target = mappings[field]
            if amount_target not in {"price_record.price_minor", "cost_record.cost_minor"}:
                raise InvalidImportError(
                    f"Transformation rule {index} currency conversion must target a price "
                    "or cost amount"
                )
            effective_at_field = rule.get("effective_at_field")
            if not isinstance(effective_at_field, str) or effective_at_field not in mappings:
                raise InvalidImportError(
                    f"Transformation rule {index} must reference a mapped effective_at_field"
                )
            amount_parent = mappings[field].rsplit(".", 1)[0]
            if mappings[effective_at_field] != f"{amount_parent}.effective_at":
                raise InvalidImportError(
                    f"Transformation rule {index} effective_at_field must map to "
                    f'"{amount_parent}.effective_at"'
                )
            target_currency = rule.get("to_currency")
            try:
                normalized_target_currency = currency_code(target_currency, "to_currency")
                target_scale = currency_minor_unit(normalized_target_currency)
            except ValueError as exc:
                raise InvalidImportError(
                    f"Transformation rule {index} has invalid to_currency"
                ) from exc
            source_name = rule.get("rate_source")
            try:
                rate_source(source_name)
            except InvalidFxRequestError as exc:
                raise InvalidImportError(
                    f"Transformation rule {index} has invalid rate_source"
                ) from exc
            dynamic_conversions[field] = (index, effective_at_field, target_scale)
        if rule_type in {"currency_convert", "currency_convert_explicit"}:
            if field in conversion_fields:
                raise InvalidImportError(
                    f'Transformation rule {index} adds a second currency conversion for "{field}"'
                )
            if field in minor_unit_fields:
                raise InvalidImportError(
                    f"Transformation rule {index} currency conversion must precede "
                    f'decimal_to_minor_units for "{field}"'
                )
            conversion_fields.add(field)
        if rule_type == "decimal_to_minor_units":
            scale = rule.get("scale", 2)
            if isinstance(scale, bool) or not isinstance(scale, int) or not 0 <= scale <= 6:
                raise InvalidImportError(
                    f"Transformation rule {index} scale must be an integer between 0 and 6"
                )
            if rule.get("rounding") not in {None, "half_even"}:
                raise InvalidImportError(
                    f'Transformation rule {index} rounding must be "half_even" when provided'
                )
            minor_unit_fields.add(field)
        key = (field, rule_type)
        if key in seen:
            raise InvalidImportError(
                f'Transformation "{rule_type}" is duplicated for source field "{field}"'
            )
        rules.append(dict(rule))
        seen.add(key)
        positions[key] = index

    for field, (conversion_index, effective_at_field, target_scale) in dynamic_conversions.items():
        amount_parent = mappings[field].rsplit(".", 1)[0]
        money_index = positions.get((field, "money_parse"))
        if money_index is not None and money_index > conversion_index:
            raise InvalidImportError(
                f'Transformation money_parse must precede currency conversion for "{field}"'
            )
        if f"{amount_parent}.currency" not in mappings.values() and money_index is None:
            raise InvalidImportError(
                f'Currency conversion for "{field}" requires a mapped currency or money_parse'
            )
        date_index = positions.get((effective_at_field, "date_parse"))
        if date_index is not None and date_index > conversion_index:
            raise InvalidImportError(
                f'Transformation date_parse must precede currency conversion for "{field}"'
            )
        minor_index = positions.get((field, "decimal_to_minor_units"))
        if minor_index is None:
            raise InvalidImportError(
                f'Currency conversion for "{field}" must be followed by decimal_to_minor_units'
            )
        minor_rule = rules[minor_index - 1]
        if minor_rule.get("scale", 2) != target_scale:
            raise InvalidImportError(
                f'Currency conversion for "{field}" requires minor-unit scale {target_scale}'
            )
        if minor_rule.get("rounding") != "half_even":
            raise InvalidImportError(
                f'Currency conversion for "{field}" requires half_even rounding'
            )
    return rules


def parse_transformation_rules_json(
    raw: str,
    mappings: Mapping[str, str],
) -> list[dict[str, object]]:
    return validate_transformation_rules(_decode(raw, "transformation_rules_json"), mappings)


def deterministic_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def map_row(raw_data: Mapping[str, object], mappings: Mapping[str, str]) -> dict[str, object]:
    result: dict[str, object] = {}
    for source, target in mappings.items():
        if source not in raw_data:
            raise InvalidImportError(
                f'Mapped source field "{source}" is missing from an import row'
            )
        segments = target.split(".")
        destination = result
        for segment in segments[:-1]:
            nested = destination.setdefault(segment, {})
            if not isinstance(nested, dict):
                raise InvalidImportError(f'Mapping target "{target}" conflicts with another target')
            destination = nested
        destination[segments[-1]] = raw_data[source]
    return result


def operation_mapping_payload(
    mappings: Mapping[str, str],
    transformation_rules: Sequence[Mapping[str, object]],
    *,
    template_id: str | None,
    template_updated_at: str | None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "mappings": dict(mappings),
        "transformation_rules": [dict(rule) for rule in transformation_rules],
    }
    if template_id is not None:
        payload["template_id"] = template_id
    if template_updated_at is not None:
        payload["template_updated_at"] = template_updated_at
    return payload


def mapping_from_operation_payload(
    payload: Mapping[str, object],
) -> tuple[dict[str, str], list[dict[str, object]], str | None]:
    mappings = validate_mappings(payload.get("mappings"))
    rules = validate_transformation_rules(payload.get("transformation_rules"), mappings)
    template_id = payload.get("template_id")
    if template_id is not None and not isinstance(template_id, str):
        raise InvalidImportError("Mapping operation template_id is invalid")
    return mappings, rules, template_id
