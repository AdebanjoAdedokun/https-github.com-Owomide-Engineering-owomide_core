from __future__ import annotations

import unittest
from decimal import Decimal

from owomide_data_pipeline.errors import InvalidImportError
from owomide_data_pipeline.profiler import ColumnProfiler


class ColumnProfilerTest(unittest.TestCase):
    def test_detects_types_hints_mappings_and_source_order(self) -> None:
        profiler = ColumnProfiler()
        profiler.observe(
            {
                "SKU": "00123",
                "Selling Price": "NGN 1,200.50",
                "Currency": "NGN",
                "Effective Date": "31/01/2026",
                "Notes": "",
            }
        )
        profiler.observe(
            {
                "SKU": "A-2",
                "Selling Price": "NGN 900.00",
                "Currency": "NGN",
                "Effective Date": "15/02/2026",
                "Notes": None,
            }
        )

        profiles = profiler.finish()

        self.assertEqual([profile.ordinal_position for profile in profiles], [1, 2, 3, 4, 5])
        self.assertEqual(profiles[0].detected_type, "string")
        self.assertEqual(profiles[0].suggested_mapping, "sku.sku_code")
        self.assertEqual(profiles[0].confidence, Decimal("0.9800"))
        self.assertEqual(profiles[1].detected_type, "decimal")
        self.assertEqual(profiles[1].currency_hint, "NGN")
        self.assertEqual(profiles[1].suggested_mapping, "price_record.price_minor")
        self.assertEqual(profiles[2].suggested_mapping, "price_record.currency")
        self.assertEqual(profiles[3].detected_type, "date")
        self.assertEqual(profiles[3].date_hint, "DD/MM/YYYY")
        self.assertEqual(profiles[3].suggested_mapping, "price_record.effective_at")
        self.assertEqual(profiles[4].detected_type, "empty")

    def test_marks_incompatible_values_as_mixed_and_reduces_mapping_confidence(self) -> None:
        profiler = ColumnProfiler()
        profiler.observe({"Unit Cost": "12.50", "Effective Date": "not-a-date"})
        profiler.observe({"Unit Cost": "N/A", "Effective Date": "2026-01-31"})

        cost, effective_date = profiler.finish()

        self.assertEqual(cost.detected_type, "mixed")
        self.assertEqual(cost.suggested_mapping, "cost_record.cost_minor")
        self.assertEqual(cost.confidence, Decimal("0.8300"))
        self.assertEqual(effective_date.detected_type, "mixed")
        self.assertEqual(effective_date.confidence, Decimal("0.8300"))

    def test_ambiguous_date_is_detected_without_guessing_format(self) -> None:
        profiler = ColumnProfiler()
        profiler.observe({"Start Date": "01/02/2026"})

        (profile,) = profiler.finish()

        self.assertEqual(profile.detected_type, "date")
        self.assertIsNone(profile.date_hint)

    def test_samples_are_distinct_bounded_and_truncated(self) -> None:
        profiler = ColumnProfiler(sample_limit=2, sample_max_chars=4)
        for value in ("alpha", "alpha", "bravo", "charlie"):
            profiler.observe({"Description": value})

        (profile,) = profiler.finish()

        self.assertEqual(profile.sample_values, ("alph", "brav"))

    def test_rejects_header_only_and_inconsistent_rows(self) -> None:
        with self.assertRaisesRegex(InvalidImportError, "does not contain any data rows"):
            ColumnProfiler().finish()

        profiler = ColumnProfiler()
        profiler.observe({"SKU": "A-1"})
        with self.assertRaisesRegex(InvalidImportError, "consistent column layout"):
            profiler.observe({"SKU": "A-2", "Price": "100"})


if __name__ == "__main__":
    unittest.main()
