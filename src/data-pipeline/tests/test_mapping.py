from __future__ import annotations

import unittest

from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.mapping import (
    map_row,
    mapping_from_operation_payload,
    operation_mapping_payload,
    parse_mappings_json,
    parse_transformation_rules_json,
)


class MappingTest(unittest.TestCase):
    def test_parses_supported_unique_targets(self) -> None:
        mappings = parse_mappings_json('{"SKU":"sku.sku_code","Price":"price_record.price_minor"}')

        self.assertEqual(
            mappings,
            {"SKU": "sku.sku_code", "Price": "price_record.price_minor"},
        )

    def test_rejects_invalid_shapes_targets_and_duplicate_targets(self) -> None:
        invalid = (
            "[]",
            "{}",
            '{"SKU": 4}',
            '{"SKU":"unknown.field"}',
            '{"SKU":"sku.sku_code","Item":"sku.sku_code"}',
            '{"SKU":"sku.sku_code","SKU":"price_record.price_minor"}',
            '{"SKU":NaN}',
        )
        for raw in invalid:
            with self.subTest(raw=raw), self.assertRaises(InvalidImportError):
                parse_mappings_json(raw)

    def test_transformation_rules_reference_mapped_fields_and_supported_types(self) -> None:
        mappings = {"Price": "price_record.price_minor"}
        rules = parse_transformation_rules_json(
            '[{"field":"Price","type":"decimal_to_minor_units","scale":2}]',
            mappings,
        )
        self.assertEqual(rules[0]["scale"], 2)

        for raw in (
            '[{"field":"Missing","type":"decimal_to_minor_units"}]',
            '[{"field":"Price","type":"future_transform"}]',
            '[{"field":"Price","type":"money_parse"},{"field":"Price","type":"money_parse"}]',
        ):
            with self.subTest(raw=raw), self.assertRaises(InvalidImportError):
                parse_transformation_rules_json(raw, mappings)

    def test_fx_rule_requires_matching_effective_date_mapping(self) -> None:
        mappings = {
            "Price": "price_record.price_minor",
            "Price Date": "price_record.effective_at",
            "Cost Date": "cost_record.effective_at",
            "Currency": "price_record.currency",
        }
        parsed = parse_transformation_rules_json(
            """[{"field":"Price","type":"currency_convert","to_currency":"NGN",
            "rate_source":"treasury","effective_at_field":"Price Date"},
            {"field":"Price","type":"decimal_to_minor_units","scale":2,
            "rounding":"half_even"}]""",
            mappings,
        )
        self.assertEqual(parsed[0]["rate_source"], "treasury")

        for raw in (
            '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
            '"rate_source":"treasury","effective_at_field":"Missing"}]',
            '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
            '"rate_source":"treasury","effective_at_field":"Cost Date"}]',
        ):
            with self.subTest(raw=raw), self.assertRaises(InvalidImportError):
                parse_transformation_rules_json(raw, mappings)

    def test_fx_rule_requires_safe_order_scale_and_rounding(self) -> None:
        mappings = {
            "Price": "price_record.price_minor",
            "Price Date": "price_record.effective_at",
            "Currency": "price_record.currency",
        }
        invalid_rules = (
            '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
            '"rate_source":"treasury","effective_at_field":"Price Date"}]',
            '[{"field":"Price","type":"currency_convert","to_currency":"JPY",'
            '"rate_source":"treasury","effective_at_field":"Price Date"},'
            '{"field":"Price","type":"decimal_to_minor_units","scale":2,'
            '"rounding":"half_even"}]',
            '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
            '"rate_source":"treasury","effective_at_field":"Price Date"},'
            '{"field":"Price","type":"decimal_to_minor_units","scale":2}]',
            '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
            '"rate_source":"treasury","effective_at_field":"Price Date"},'
            '{"field":"Price Date","type":"date_parse","format":"DD/MM/YYYY"},'
            '{"field":"Price","type":"decimal_to_minor_units","scale":2,'
            '"rounding":"half_even"}]',
        )

        for raw in invalid_rules:
            with self.subTest(raw=raw), self.assertRaises(InvalidImportError):
                parse_transformation_rules_json(raw, mappings)

        with self.assertRaisesRegex(InvalidImportError, "mapped currency or money_parse"):
            parse_transformation_rules_json(
                '[{"field":"Price","type":"currency_convert","to_currency":"NGN",'
                '"rate_source":"treasury","effective_at_field":"Price Date"},'
                '{"field":"Price","type":"decimal_to_minor_units","scale":2,'
                '"rounding":"half_even"}]',
                {
                    "Price": "price_record.price_minor",
                    "Price Date": "price_record.effective_at",
                },
            )

    def test_maps_nested_values_without_mutating_raw_data(self) -> None:
        raw = {"SKU": "0012", "Price": "10.50", "Ignored": "kept raw"}

        mapped = map_row(
            raw,
            {
                "SKU": "sku.sku_code",
                "Price": "price_record.price_minor",
            },
        )

        self.assertEqual(
            mapped,
            {
                "sku": {"sku_code": "0012"},
                "price_record": {"price_minor": "10.50"},
            },
        )
        self.assertEqual(raw["Ignored"], "kept raw")

    def test_operation_payload_is_a_deterministic_retry_snapshot(self) -> None:
        payload = operation_mapping_payload(
            {"SKU": "sku.sku_code"},
            [],
            template_id="7b91bc8d-6b35-4055-bb0c-120e49c85039",
            template_updated_at="2026-07-12T08:00:00+00:00",
        )

        mappings, rules, template_id = mapping_from_operation_payload(payload)

        self.assertEqual(mappings, {"SKU": "sku.sku_code"})
        self.assertEqual(rules, [])
        self.assertEqual(template_id, "7b91bc8d-6b35-4055-bb0c-120e49c85039")


if __name__ == "__main__":
    unittest.main()
