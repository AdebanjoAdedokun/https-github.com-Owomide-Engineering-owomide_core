from __future__ import annotations

import unittest

from owomide_data_pipeline.canonical import canonical_row
from owomide_data_pipeline.errors import InvalidImportError


class CanonicalRowTest(unittest.TestCase):
    def test_builds_catalog_writes_without_losing_minor_units_or_dimensions(self) -> None:
        row = canonical_row(
            row_id="00000000-0000-0000-0000-000000000001",
            mapped_data={
                "sku": {
                    "sku_code": "A-1",
                    "pack_size": 12,
                    "unit": "case",
                    "identifier_type": "gtin",
                    "identifier_namespace": "GS1",
                    "identifier": "0123456789012",
                    "attributes": {"brand": "Acme"},
                },
                "cost_record": {
                    "cost_minor": 800,
                    "currency": "ngn",
                    "cost_type": "landed",
                    "effective_at": "2026-07-12T00:00:00Z",
                },
                "price_record": {
                    "channel_id": "00000000-0000-0000-0000-000000000201",
                    "location_id": "00000000-0000-0000-0000-000000000301",
                    "price_minor": 1200,
                    "currency": "ngn",
                    "effective_at": "2026-07-12T00:00:00Z",
                    "effective_until": "2026-08-01T00:00:00Z",
                },
            },
        )

        self.assertEqual(row.sku_identity.sku_code, "A-1")
        self.assertEqual(row.new_sku.pack_size, 12)
        self.assertEqual(row.new_sku.identifiers[0].value, "0123456789012")
        self.assertEqual(row.cost.cost.amount, 800)
        self.assertEqual(row.cost.cost.currency, "NGN")
        self.assertEqual(row.prices[0].price.amount, 1200)
        self.assertEqual(
            row.prices[0].location_id,
            "00000000-0000-0000-0000-000000000301",
        )
        self.assertTrue(row.prices[0].HasField("effective_until"))

    def test_rejects_decimal_or_boolean_money_instead_of_coercing_it(self) -> None:
        for amount in (10.5, True, "1000"):
            with self.subTest(amount=amount), self.assertRaises(InvalidImportError):
                canonical_row(
                    row_id="row-1",
                    mapped_data={
                        "sku": {"sku_code": "A-1"},
                        "price_record": {
                            "channel_id": "channel-1",
                            "price_minor": amount,
                            "currency": "NGN",
                            "effective_at": "2026-07-12",
                        },
                    },
                )

    def test_identifier_only_rows_resolve_existing_skus_without_creating_one(self) -> None:
        row = canonical_row(
            row_id="row-1",
            mapped_data={
                "sku": {"identifier_type": "gtin", "identifier": "0123456789012"},
                "cost_record": {
                    "cost_minor": 700,
                    "currency": "NGN",
                    "effective_at": "2026-07-12",
                },
            },
        )

        self.assertEqual(row.sku_identity.identifier.value, "0123456789012")
        self.assertFalse(row.HasField("new_sku"))


if __name__ == "__main__":
    unittest.main()
