from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
