from __future__ import annotations

import unittest
from dataclasses import replace

from owomide_data_pipeline.catalog import CatalogSnapshot, ChannelReference, CostReference
from owomide_data_pipeline.validation import validate_row

SKU_ID = "00000000-0000-0000-0000-000000000101"
CHANNEL_ID = "00000000-0000-0000-0000-000000000201"


def snapshot() -> CatalogSnapshot:
    channel = ChannelReference(CHANNEL_ID, "RETAIL", "NGN")
    cost = CostReference(SKU_ID, None, 800, "NGN")
    return CatalogSnapshot(
        channels_by_id={CHANNEL_ID: channel},
        channels_by_code={"RETAIL": channel},
        location_ids=frozenset(),
        segment_ids=frozenset(),
        sku_ids=frozenset({SKU_ID}),
        costs={(SKU_ID, None): cost},
    )


class ValidationTest(unittest.TestCase):
    def test_validates_and_resolves_a_clean_price_row(self) -> None:
        mapped, findings = validate_row(
            {
                "sku": {"sku_id": SKU_ID},
                "channel": {"code": "retail"},
                "price_record": {
                    "price_minor": 1000,
                    "currency": "ngn",
                    "effective_at": "2026-07-12",
                    "tax_inclusive": "Inclusive",
                    "tax_rate_pct": "7.5%",
                },
            },
            row_number=2,
            batch_channel_id=None,
            batch_customer_segment_id=None,
            snapshot=snapshot(),
            transformation_failures=[],
        )

        self.assertEqual(mapped["price_record"]["channel_id"], CHANNEL_ID)
        self.assertEqual(mapped["price_record"]["currency"], "NGN")
        self.assertEqual(mapped["price_record"]["effective_at"], "2026-07-12T00:00:00Z")
        self.assertIs(mapped["price_record"]["tax_inclusive"], True)
        self.assertEqual(mapped["price_record"]["tax_rate_bp"], 750)
        self.assertNotIn("tax_rate_pct", mapped["price_record"])
        self.assertEqual([finding.code for finding in findings], ["invalid_cost"])
        self.assertEqual(findings[0].severity, "warning")

    def test_reports_actionable_identity_money_channel_and_date_errors(self) -> None:
        _, findings = validate_row(
            {
                "sku": {},
                "channel": {"code": "missing"},
                "price_record": {
                    "price_minor": "10.50",
                    "currency": "XYZ",
                    "effective_at": "12/07/2026",
                },
            },
            row_number=47,
            batch_channel_id=None,
            batch_customer_segment_id=None,
            snapshot=snapshot(),
            transformation_failures=[],
        )

        codes = {finding.code for finding in findings}
        self.assertTrue(
            {"missing_sku_identity", "invalid_price", "invalid_currency", "unknown_channel"}
            <= codes
        )
        self.assertIn("invalid_effective_date", codes)
        self.assertTrue(all(finding.message.startswith("Row 47:") for finding in findings))

    def test_flags_price_below_catalog_cost(self) -> None:
        _, findings = validate_row(
            {
                "sku": {"sku_id": SKU_ID},
                "price_record": {
                    "channel_id": CHANNEL_ID,
                    "price_minor": 700,
                    "currency": "NGN",
                    "effective_at": "2026-07-12",
                },
            },
            row_number=3,
            batch_channel_id=None,
            batch_customer_segment_id=None,
            snapshot=snapshot(),
            transformation_failures=[],
        )

        self.assertIn("below_cost", {finding.code for finding in findings})

    def test_rejects_cross_org_explicit_references(self) -> None:
        _, findings = validate_row(
            {
                "sku": {"sku_id": "00000000-0000-0000-0000-000000000999"},
                "price_record": {
                    "channel_id": "00000000-0000-0000-0000-000000000998",
                    "price_minor": 1000,
                    "currency": "NGN",
                    "effective_at": "2026-07-12",
                },
            },
            row_number=4,
            batch_channel_id=None,
            batch_customer_segment_id=None,
            snapshot=snapshot(),
            transformation_failures=[],
        )

        cross_org = [finding for finding in findings if finding.code == "cross_org_reference"]
        self.assertEqual(len(cross_org), 2)


def price_row(**price: object) -> dict[str, object]:
    return {
        "sku": {"sku_id": SKU_ID},
        "price_record": {
            "channel_id": CHANNEL_ID,
            "currency": "NGN",
            "effective_at": "2026-07-12",
            **price,
        },
    }


def codes_for(row: dict[str, object], snap: CatalogSnapshot | None = None) -> list[str]:
    _, findings = validate_row(
        row,
        row_number=5,
        batch_channel_id=None,
        batch_customer_segment_id=None,
        snapshot=snap or snapshot(),
        transformation_failures=[],
    )
    return [finding.code for finding in findings]


class TaxBasisAndUnitsTest(unittest.TestCase):
    """DATA-022 and ADR-016: every price states whether it includes VAT, and at what rate."""

    def test_notes_when_neither_the_file_nor_the_organisation_states_a_basis(self) -> None:
        _, findings = validate_row(
            price_row(price_minor=1000),
            row_number=5,
            batch_channel_id=None,
            batch_customer_segment_id=None,
            snapshot=snapshot(),
            transformation_failures=[],
        )
        # Information, so the row stays committable without confirmation.
        self.assertIn(("tax_basis_missing", "info"), [(f.code, f.severity) for f in findings])

    def test_organisation_default_applies_when_the_file_is_silent(self) -> None:
        snap = replace(snapshot(), default_tax_inclusive=True, default_tax_rate_bp=750)
        row = price_row(price_minor=1000)
        self.assertNotIn("tax_basis_missing", codes_for(row, snap))
        # The row stays silent; Catalog stamps the default flag and rate together.
        self.assertNotIn("tax_inclusive", row["price_record"])
        self.assertNotIn("tax_rate_bp", row["price_record"])
        # The default still decides the below-cost check: 850 incl. 7.5% VAT < cost 800.
        self.assertIn("below_cost", codes_for(price_row(price_minor=850), snap))
        # A rate in the file is kept, with the default basis stated beside it.
        row = price_row(price_minor=1000, tax_rate_pct="5")
        codes_for(row, snap)
        self.assertEqual(
            (row["price_record"]["tax_inclusive"], row["price_record"]["tax_rate_bp"]), (True, 500)
        )

    def test_a_rate_without_any_basis_is_not_stored(self) -> None:
        row = price_row(price_minor=1000, tax_rate_pct="7.5")
        self.assertIn("tax_basis_missing", codes_for(row))
        self.assertNotIn("tax_rate_bp", row["price_record"])

    def test_inclusive_price_without_a_rate_is_a_warning_not_a_rejection(self) -> None:
        codes = codes_for(price_row(price_minor=1000, tax_inclusive="yes"))
        self.assertEqual(
            [c for c in codes if c.startswith("tax")], ["tax_rate_missing_for_inclusive_price"]
        )

    def test_refuses_unreadable_flags_and_rates_instead_of_guessing(self) -> None:
        self.assertIn(
            "invalid_tax_flag", codes_for(price_row(price_minor=1000, tax_inclusive="maybe"))
        )
        for bad in ("7.505", "-1", "101", "seven", 7.5):
            with self.subTest(rate=bad):
                self.assertIn(
                    "invalid_tax_rate",
                    codes_for(price_row(price_minor=1000, tax_inclusive="no", tax_rate_pct=bad)),
                )

    def test_below_cost_is_judged_after_removing_vat(self) -> None:
        # Cost 800. 850 including 7.5% VAT is 790.70 before VAT: below cost.
        self.assertIn(
            "below_cost",
            codes_for(price_row(price_minor=850, tax_inclusive="inclusive", tax_rate_pct="7.5")),
        )
        # 860 including VAT is exactly 800.00 before VAT: not below cost (limits are inclusive).
        self.assertNotIn(
            "below_cost",
            codes_for(price_row(price_minor=860, tax_inclusive="inclusive", tax_rate_pct="7.5")),
        )
        # The same 850 stated as VAT-exclusive is above cost.
        self.assertNotIn(
            "below_cost", codes_for(price_row(price_minor=850, tax_inclusive="exclusive"))
        )

    def test_a_price_below_cost_as_written_is_flagged_even_without_a_basis(self) -> None:
        codes = codes_for(price_row(price_minor=700))
        self.assertIn("below_cost", codes)
        self.assertIn("tax_basis_missing", codes)

    def test_normalises_cost_units_and_flags_units_that_do_not_match_the_sku(self) -> None:
        row = {
            "sku": {"sku_code": "BEV-1", "unit": "Each"},
            "cost_record": {
                "cost_minor": 500,
                "currency": "NGN",
                "effective_at": "2026-07-12",
                "unit": "Carton 12",
            },
        }
        self.assertIn("cost_unit_incompatible", codes_for(row))
        self.assertEqual(row["cost_record"]["unit"], "carton_12")
        row["cost_record"]["unit"] = " EACH "
        self.assertNotIn("cost_unit_incompatible", codes_for(row))
        self.assertEqual(row["cost_record"]["unit"], "each")
        row["cost_record"]["unit"] = "12-pack"
        self.assertIn("invalid_cost_unit", codes_for(row))


if __name__ == "__main__":
    unittest.main()
