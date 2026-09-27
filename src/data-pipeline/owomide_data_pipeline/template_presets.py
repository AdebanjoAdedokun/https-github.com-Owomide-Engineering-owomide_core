"""Mapping presets for Owómidé's own import templates (core-handoff/import-template.md).

A design partner who fills in the templates needs no column mapping: apply the preset for the
file. Each preset is validated with the same rules as a saved mapping template.

Two template columns have no canonical target yet and are deliberately left unmapped:

- ``location`` (prices and costs): Catalog needs a location id, and there is no code-to-id
  lookup in the import. Release 1 prices are organisation-wide, so files for Release 1 must not
  contain location rows; the readiness check reports any it finds.
- ``source`` (costs): provenance text; the import ledger already records the file.

The products file cannot be imported on its own: every import row needs a price or a cost.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any

from owomide_data_pipeline.mapping import validate_mappings, validate_transformation_rules

PRICES_V1: dict[str, Any] = {
    "mappings": {
        "sku_code": "sku.sku_code",
        "price": "price_record.price_minor",
        "currency": "price_record.currency",
        "tax_inclusive": "price_record.tax_inclusive",
        "tax_rate_pct": "price_record.tax_rate_pct",
        "channel": "channel.code",
        "effective_from": "price_record.effective_at",
        "effective_to": "price_record.effective_until",
    },
    "transformation_rules": [
        {"field": "price", "type": "decimal_to_minor_units", "scale": 2},
        {"field": "tax_inclusive", "type": "tax_flag"},
        {"field": "effective_from", "type": "date_parse"},
    ],
    "unmapped_columns": ["location"],
}

COSTS_V1: dict[str, Any] = {
    "mappings": {
        "sku_code": "sku.sku_code",
        "cost": "cost_record.cost_minor",
        "currency": "cost_record.currency",
        "cost_basis": "cost_record.cost_type",
        "unit": "cost_record.unit",
        "effective_from": "cost_record.effective_at",
    },
    "transformation_rules": [
        {"field": "cost", "type": "decimal_to_minor_units", "scale": 2},
        {"field": "effective_from", "type": "date_parse"},
    ],
    "unmapped_columns": ["location", "source"],
}

PRESETS = MappingProxyType({"owomide_prices_v1": PRICES_V1, "owomide_costs_v1": COSTS_V1})


def preset(name: str) -> tuple[dict[str, str], list[dict[str, object]]]:
    """The validated mappings and transformation rules for a preset."""
    if name not in PRESETS:
        raise KeyError(f"unknown mapping preset {name!r}; choose one of {sorted(PRESETS)}")
    config = PRESETS[name]
    mappings = validate_mappings(dict(config["mappings"]))
    rules = validate_transformation_rules(
        [dict(r) for r in config["transformation_rules"]], mappings
    )
    return mappings, rules
