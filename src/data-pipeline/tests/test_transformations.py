from __future__ import annotations

import unittest
from datetime import UTC, datetime
from decimal import Decimal

from owomide_data_pipeline.transformations import (
    TransformationError,
    apply_transformations,
    cost_unit_code,
    decimal_to_minor_units,
    parse_date,
    parse_money,
    percent_to_basis_points,
)


class TransformationsTest(unittest.TestCase):
    def test_parses_money_without_float_rounding(self) -> None:
        amount, currency = parse_money("NGN 1,234.50")

        self.assertEqual(amount, Decimal("1234.50"))
        self.assertEqual(currency, "NGN")
        self.assertEqual(decimal_to_minor_units(amount, 2), 123_450)

    def test_rejects_excess_precision_and_ambiguous_symbols(self) -> None:
        with self.assertRaisesRegex(TransformationError, "more than 2 decimal"):
            decimal_to_minor_units("1.001", 2)
        with self.assertRaisesRegex(TransformationError, "ambiguous"):
            parse_money("$10.00")

    def test_dates_require_explicit_format_when_not_iso(self) -> None:
        self.assertEqual(parse_date("2026-07-12"), "2026-07-12T00:00:00Z")
        self.assertEqual(
            parse_date("12/07/2026", ["DD/MM/YYYY"]),
            "2026-07-12T00:00:00Z",
        )
        with self.assertRaisesRegex(TransformationError, "ambiguous"):
            parse_date("12/07/2026")

    def test_executes_ordered_rules_and_reports_row_failures(self) -> None:
        mapped, failures = apply_transformations(
            {
                "price_record": {"price_minor": "NGN 10.50"},
                "sku": {"pack_size": "not-a-pack"},
            },
            {"Price": "price_record.price_minor", "Pack": "sku.pack_size"},
            [
                {"field": "Price", "type": "money_parse"},
                {
                    "field": "Price",
                    "type": "decimal_to_minor_units",
                    "scale": 2,
                    "rounding": "half_even",
                },
                {"field": "Pack", "type": "pack_size_normalize"},
            ],
        )

        self.assertEqual(mapped["price_record"], {"price_minor": 1050, "currency": "NGN"})
        self.assertEqual(failures[0][0], "sku.pack_size")
        self.assertEqual(mapped["sku"]["pack_size"], "not-a-pack")

    def test_explicit_currency_conversion_requires_matching_currency(self) -> None:
        mapped, failures = apply_transformations(
            {"price_record": {"price_minor": "10", "currency": "USD"}},
            {"Price": "price_record.price_minor"},
            [
                {
                    "field": "Price",
                    "type": "currency_convert_explicit",
                    "from_currency": "USD",
                    "to_currency": "NGN",
                    "rate": "1500.25",
                }
            ],
        )

        self.assertEqual(mapped["price_record"]["price_minor"], "15002.50")
        self.assertEqual(mapped["price_record"]["currency"], "NGN")
        self.assertEqual(failures, [])

    def test_historical_currency_conversion_uses_effective_date_and_rate_source(self) -> None:
        calls: list[tuple[str, str, str, datetime]] = []

        def resolve(source: str, target: str, rate_source: str, effective_at: datetime):
            calls.append((source, target, rate_source, effective_at))
            return Decimal("1500.25")

        mapped, failures = apply_transformations(
            {
                "price_record": {
                    "price_minor": "10.50",
                    "currency": "USD",
                    "effective_at": "2026-07-31",
                }
            },
            {
                "Price": "price_record.price_minor",
                "Effective At": "price_record.effective_at",
            },
            [
                {
                    "field": "Price",
                    "type": "currency_convert",
                    "to_currency": "NGN",
                    "rate_source": "treasury",
                    "effective_at_field": "Effective At",
                },
                {
                    "field": "Price",
                    "type": "decimal_to_minor_units",
                    "scale": 2,
                    "rounding": "half_even",
                },
            ],
            fx_rate_resolver=resolve,
        )

        self.assertEqual(mapped["price_record"]["price_minor"], 1_575_262)
        self.assertEqual(mapped["price_record"]["currency"], "NGN")
        self.assertEqual(
            calls,
            [("USD", "NGN", "treasury", datetime(2026, 7, 31, tzinfo=UTC))],
        )
        self.assertEqual(failures, [])


class TaxRateAndUnitTest(unittest.TestCase):
    def test_tax_rates_become_exact_basis_points(self) -> None:
        for raw, expected in (("7.5", 750), ("7.5%", 750), (" 7.50 % ", 750), ("0", 0), (15, 1500)):
            with self.subTest(raw=raw):
                self.assertEqual(percent_to_basis_points(raw), expected)
        for bad in ("7.505", "-0.5", "100.01", "", 7.5, True):
            with self.subTest(bad=bad), self.assertRaises(TransformationError):
                percent_to_basis_points(bad)

    def test_cost_units_become_catalog_codes(self) -> None:
        self.assertEqual(cost_unit_code(" Each "), "each")
        self.assertEqual(cost_unit_code("Carton 12"), "carton_12")
        self.assertEqual(cost_unit_code("kg"), "kg")
        for bad in ("", "12-pack", "carton/12", 5):
            with self.subTest(bad=bad), self.assertRaises(TransformationError):
                cost_unit_code(bad)


if __name__ == "__main__":
    unittest.main()
