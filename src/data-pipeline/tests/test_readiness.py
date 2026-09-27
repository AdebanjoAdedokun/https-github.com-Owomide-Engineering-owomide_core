from __future__ import annotations

import io
import json
import os
import re
import unittest
from contextlib import redirect_stdout
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory

from owomide_data_pipeline.intelligence import readiness as readiness_module
from owomide_data_pipeline.intelligence.readiness import (
    _PROBLEM_TEXT,
    NOT_READY,
    READY,
    READY_WITH_GAPS,
    Settings,
    assess,
    load_csv,
    main,
    markdown,
)

AT = datetime.fromisoformat("2026-10-01T00:00:00+01:00")
FROM = "2026-09-01T00:00:00+01:00"
LAGOS = Settings(
    currency="NGN",
    default_tax_inclusive=True,
    default_tax_rate_pct=Fraction(15, 2),
    cost_basis="landed",
    at=AT,
    min_margin_pct=Fraction(15),
)


def product(sku: str, unit: str = "each") -> dict[str, str]:
    return {"sku_code": sku, "product_name": sku, "category": "Beverages", "unit": unit}


def price(sku: str, amount: str, **extra: str) -> dict[str, str]:
    return {"sku_code": sku, "price": amount, "currency": "NGN", "effective_from": FROM, **extra}


def cost(sku: str, amount: str, **extra: str) -> dict[str, str]:
    return {
        "sku_code": sku,
        "cost": amount,
        "currency": "NGN",
        "cost_basis": "landed",
        "unit": "each",
        "effective_from": FROM,
        **extra,
    }


def codes(report) -> list[tuple[str, int | None, str]]:
    return [(p.file, p.row, p.code) for p in report.problems]


class ReadinessTest(unittest.TestCase):
    def test_prd_anchor_margin_is_computed_after_removing_vat(self) -> None:
        # 1,075.00 incl. 7.5% VAT is 1,000.00 before VAT; landed cost 800.00 gives 20.0%.
        report = assess(
            [product("BEV-00001")],
            [("prices", [price("BEV-00001", "1075.00")])],
            [("costs", [cost("BEV-00001", "800.00")])],
            LAGOS,
        )
        self.assertEqual(
            (report.verdict, report.margin_ready, report.below_min_margin), (READY, 1, 0)
        )
        # 900.00 incl. VAT (837.21 before VAT) is 4.4%: below the 15% minimum, not below cost.
        report = assess(
            [product("BEV-00001")],
            [("prices", [price("BEV-00001", "900.00")])],
            [("costs", [cost("BEV-00001", "800.00")])],
            LAGOS,
        )
        self.assertEqual((report.below_min_margin, report.below_cost), (1, 0))
        # 850.00 incl. VAT is 790.70 before VAT: below cost, though it looks above 800.
        report = assess(
            [product("BEV-00001")],
            [("prices", [price("BEV-00001", "850.00")])],
            [("costs", [cost("BEV-00001", "800.00")])],
            LAGOS,
        )
        self.assertEqual(report.below_cost, 1)

    def test_names_every_reason_a_margin_cannot_be_calculated(self) -> None:
        no_default = Settings(
            currency="NGN",
            default_tax_inclusive=None,
            default_tax_rate_pct=None,
            cost_basis="landed",
            at=AT,
        )
        report = assess(
            [product("A"), product("B"), product("C"), product("D"), product("E")],
            [
                (
                    "prices",
                    [
                        price("A", "100.00"),  # no tax basis, no default
                        price("B", "100.00", tax_inclusive="true"),  # inclusive, no rate
                        price("C", "100.00", tax_inclusive="false"),  # no cost below
                        price("E", "0.00", tax_inclusive="false"),  # zero price
                    ],
                )
            ],
            [
                (
                    "costs",
                    [cost("A", "50.00"), cost("B", "50.00"), cost("D", "50.00"), cost("E", "1.00")],
                )
            ],
            no_default,
        )
        self.assertEqual(
            report.unable_to_evaluate,
            {
                "no_applicable_cost_record": 1,
                "no_applicable_price_record": 1,
                "price_not_positive": 1,
                "tax_basis_unknown": 1,
                "tax_rate_missing": 1,
            },
        )
        self.assertEqual(report.verdict, NOT_READY)  # 0 of 5 products are ready
        self.assertIn(("prices", None, "tax_basis_missing"), codes(report))
        self.assertIn(("prices", None, "tax_rate_missing_for_inclusive_price"), codes(report))

    def test_reports_bad_rows_by_file_row_and_column_without_fixing_them(self) -> None:
        report = assess(
            [product("A"), product("A"), product("B"), {"sku_code": "C", "product_name": "C"}],
            [
                (
                    "prices",
                    [
                        price("B", "1,500"),
                        price("B", "-5.00"),
                        price("Z", "10.00"),
                        price("B", "10.00", currency="NAIRA"),
                        price("B", "10.00", effective_from="2026-09-01"),
                        price("B", "10.00", tax_inclusive="maybe"),
                    ],
                )
            ],
            [("costs", [cost("B", "0.00"), cost("B", "5.00", unit="carton")])],
            LAGOS,
        )
        found = codes(report)
        for expected in [
            ("products", 2, "duplicate_in_file"),
            ("products", 3, "duplicate_in_file"),
            ("products", 5, "missing_value"),
            ("prices", 2, "invalid_number"),
            ("prices", 3, "negative_value"),
            ("prices", 4, "unknown_sku"),
            ("prices", 5, "invalid_currency"),
            ("prices", 6, "invalid_date"),
            ("prices", 7, "invalid_tax_flag"),
            ("costs", 2, "zero_cost"),
            ("costs", 3, "cost_unit_incompatible"),
        ]:
            self.assertIn(expected, found)
        missing = [p for p in report.problems if p.row == 5 and p.file == "products"]
        self.assertEqual(sorted(p.column or "" for p in missing), ["category", "unit"])
        self.assertEqual(report.verdict, NOT_READY)  # the products file itself has errors

    def test_holds_two_current_records_instead_of_choosing_one(self) -> None:
        report = assess(
            [product("A")],
            [("prices", [price("A", "100.00"), price("A", "110.00")])],
            [("costs", [cost("A", "50.00")])],
            LAGOS,
        )
        self.assertEqual(report.unable_to_evaluate, {"no_applicable_price_record": 1})
        self.assertEqual(
            [c for _, _, c in codes(report)], ["duplicate_in_file", "duplicate_in_file"]
        )

    def test_a_later_file_supersedes_an_earlier_one(self) -> None:
        report = assess(
            [product("A")],
            [("prices", [price("A", "1075.00")])],
            [
                ("costs.csv", [cost("A", "800.00")]),
                ("update.csv", [cost("A", "950.00", effective_from="2026-09-20T00:00:00+01:00")]),
            ],
            LAGOS,
        )
        # 1,000.00 before VAT against the updated 950.00 is 5%: below the 15% minimum.
        self.assertEqual((report.margin_ready, report.below_min_margin), (1, 1))

    def test_sets_aside_what_release_1_does_not_use(self) -> None:
        report = assess(
            [product("A")],
            [
                (
                    "prices",
                    [
                        price("A", "1075.00"),
                        price("A", "1100.00", location="IKJ"),
                        price("A", "1200.00", effective_from="2026-12-01T00:00:00+01:00"),
                    ],
                )
            ],
            [
                (
                    "costs",
                    [
                        cost("A", "800.00"),
                        cost("A", "700.00", cost_basis="purchase"),
                        cost("A", "5.00", currency="USD"),
                    ],
                )
            ],
            LAGOS,
        )
        self.assertEqual(report.verdict, READY)
        self.assertEqual(
            report.set_aside_rows,
            {"cost_basis_purchase": 1, "location_or_channel_price": 1, "not_current_price": 1},
        )
        self.assertIn(("costs", 4, "currency_incompatible"), codes(report))

    def test_ready_with_gaps_between_half_and_the_ready_share(self) -> None:
        products = [product(f"S{i}") for i in range(10)]
        prices = [price(f"S{i}", "107.50") for i in range(10)]
        costs = [cost(f"S{i}", "50.00") for i in range(8)]
        report = assess(products, [("prices", prices)], [("costs", costs)], LAGOS)
        self.assertEqual((report.verdict, report.margin_ready_pct), (READY_WITH_GAPS, "80.0"))

    def test_command_line_prints_json_and_fails_when_not_ready(self) -> None:
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "products.csv").write_text(
                "sku_code,product_name,category,unit,pack_size\nA,Juice,Beverages,each,1\n"
            )
            (base / "prices.csv").write_text(
                "sku_code,price,currency,tax_inclusive,tax_rate_pct,location,channel,effective_from,"
                f"effective_to\nA,1075.00,NGN,true,7.5,,,{FROM},\n"
            )
            (base / "costs.csv").write_text(
                "sku_code,cost,currency,cost_basis,unit,location,effective_from,source\n"
                f"A,800.00,NGN,landed,each,,{FROM},Opening file\n"
            )
            args = [
                "--products",
                str(base / "products.csv"),
                "--prices",
                str(base / "prices.csv"),
                "--costs",
                str(base / "costs.csv"),
                "--currency",
                "ngn",
                "--at",
                "2026-10-01T00:00:00+01:00",
                "--json",
            ]
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                status = main(args)
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(buffer.getvalue())["margin_ready"], 1)
            (base / "costs.csv").write_text(
                "sku_code,cost,currency,cost_basis,unit,location,effective_from,source\n"
            )
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main(args), 1)


class MarkdownReportTest(unittest.TestCase):
    def test_explains_every_problem_code_and_lists_products_and_rows(self) -> None:
        report = assess(
            [product("A"), product("B"), product("C")],
            [("prices.csv", [price("A", "1075.00"), price("B", "1,500"), price("C", "100.00")])],
            [("costs.csv", [cost("A", "800.00")])],
            LAGOS,
        )
        text = markdown(report, LAGOS, "Data readiness report: Example Stores")
        self.assertTrue(text.startswith("# Data readiness report: Example Stores\n"))
        self.assertIn("| In the products file | 3 |", text)
        self.assertIn("- No current price: B", text)
        self.assertIn("- No usable cost: C", text)
        self.assertIn("| prices.csv | Must fix: A number is written with commas", text)
        self.assertIn("| 3 |", text)  # the bad row number
        self.assertIn("Below the 15% minimum margin", text)

    def test_has_plain_text_for_every_code_the_checker_can_emit(self) -> None:
        source = Path(readiness_module.__file__).read_text()
        codes = set(re.findall(r'out\.add\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*"([a-z_]+)"', source))
        self.assertTrue(codes)
        self.assertEqual(codes - set(_PROBLEM_TEXT), set(), "a problem code has no explanation")


@unittest.skipUnless(
    os.environ.get("OWOMIDE_TEST_CATALOGUE"),
    "set OWOMIDE_TEST_CATALOGUE to the core-handoff/test-catalogue directory",
)
class TestCatalogueConformanceTest(unittest.TestCase):
    """The generated 5,000-SKU pilot catalogue and its independently computed expectations."""

    def test_baseline_and_supplier_update(self) -> None:
        root = Path(os.environ["OWOMIDE_TEST_CATALOGUE"])
        data = root / "data"
        products = load_csv(data / "products.csv")
        prices = [("prices.csv", load_csv(data / "prices.csv"))]
        opening = ("costs.csv", load_csv(data / "costs.csv"))
        update = (
            "costs_supplier_update_2026-10-12.csv",
            load_csv(data / "costs_supplier_update_2026-10-12.csv"),
        )

        baseline = assess(products, prices, [opening], LAGOS)
        self.assertEqual((baseline.products, baseline.margin_ready), (5000, 4975))
        self.assertEqual(baseline.unable_to_evaluate, {"no_applicable_cost_record": 25})
        self.assertEqual(baseline.below_min_margin, 0)

        after = assess(
            products,
            prices,
            [opening, update],
            Settings(
                **{**_fields(LAGOS), "at": datetime.fromisoformat("2026-10-13T00:00:00+01:00")}
            ),
        )
        expected = json.loads((root / "expected" / "exposure_after_update.json").read_text())
        self.assertEqual(after.below_min_margin, expected["breach_count"])
        self.assertEqual(
            sum(after.unable_to_evaluate.values()), expected["unable_to_evaluate_count"]
        )

        imported = json.loads((root / "expected" / "supplier_update_import.json").read_text())
        not_ready = {r["row"] for r in imported["rows"] if r["outcome"] != "ready"}
        flagged = {p.row for p in after.problems if p.file == update[0]}
        self.assertEqual(flagged, not_ready)


def _fields(settings: Settings) -> dict[str, object]:
    return {name: getattr(settings, name) for name in settings.__slots__}


if __name__ == "__main__":
    unittest.main()
