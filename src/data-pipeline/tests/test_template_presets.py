from __future__ import annotations

import csv
import io
import unittest

from owomide_data_pipeline.catalog import CatalogSnapshot, ChannelReference
from owomide_data_pipeline.mapping import map_row
from owomide_data_pipeline.template_presets import PRESETS, preset
from owomide_data_pipeline.transformations import apply_transformations
from owomide_data_pipeline.validation import validate_row

CHANNEL_ID = "00000000-0000-0000-0000-000000000201"
PRICES = (
    "sku_code,price,currency,tax_inclusive,tax_rate_pct,location,channel,effective_from,effective_to\n"
    "BEV-00001,1075.00,NGN,true,7.5,,,2026-09-01T00:00:00+01:00,\n"
)
COSTS = (
    "sku_code,cost,currency,cost_basis,unit,location,effective_from,source\n"
    "BEV-00001,800.00,NGN,landed,each,,2026-09-01T00:00:00+01:00,Opening cost file\n"
)


def snapshot() -> CatalogSnapshot:
    channel = ChannelReference(CHANNEL_ID, "DEFAULT", "NGN")
    return CatalogSnapshot(
        channels_by_id={CHANNEL_ID: channel},
        channels_by_code={"DEFAULT": channel},
        location_ids=frozenset(),
        segment_ids=frozenset(),
        sku_ids=frozenset(),
        costs={},
    )


def run(name: str, text: str) -> tuple[dict[str, object], list[str]]:
    mappings, rules = preset(name)
    (row,) = list(csv.DictReader(io.StringIO(text)))
    mapped, failures = apply_transformations(map_row(row, mappings), mappings, rules)
    validated, findings = validate_row(
        mapped,
        row_number=2,
        batch_channel_id=CHANNEL_ID,
        batch_customer_segment_id=None,
        snapshot=snapshot(),
        transformation_failures=failures,
    )
    return validated, [f.code for f in findings]


class TemplatePresetsTest(unittest.TestCase):
    def test_every_preset_is_a_valid_mapping_template(self) -> None:
        for name in PRESETS:
            with self.subTest(name=name):
                mappings, rules = preset(name)
                self.assertTrue(mappings)
                self.assertTrue(rules)

    def test_every_template_column_is_mapped_or_named_as_unmapped(self) -> None:
        headers = {"owomide_prices_v1": PRICES, "owomide_costs_v1": COSTS}
        for name, text in headers.items():
            with self.subTest(name=name):
                columns = set(text.splitlines()[0].split(","))
                config = PRESETS[name]
                self.assertEqual(columns, set(config["mappings"]) | set(config["unmapped_columns"]))

    def test_a_template_price_row_imports_cleanly_with_its_vat_basis(self) -> None:
        mapped, codes = run("owomide_prices_v1", PRICES)
        price = mapped["price_record"]
        assert isinstance(price, dict)
        self.assertEqual(price["price_minor"], 107_500)
        self.assertIs(price["tax_inclusive"], True)
        self.assertEqual(price["tax_rate_bp"], 750)
        self.assertEqual(price["channel_id"], CHANNEL_ID)  # blank channel: the batch's channel
        self.assertEqual(price["effective_at"], "2026-08-31T23:00:00Z")
        # The only finding: no cost on a price row, which the pipeline always notes.
        self.assertEqual(codes, ["invalid_cost"])

    def test_a_template_cost_row_imports_cleanly_with_its_unit_and_basis(self) -> None:
        mapped, codes = run("owomide_costs_v1", COSTS)
        cost = mapped["cost_record"]
        assert isinstance(cost, dict)
        self.assertEqual(
            (cost["cost_minor"], cost["cost_type"], cost["unit"]), (80_000, "landed", "each")
        )
        self.assertEqual(codes, [])

    def test_unknown_presets_are_refused(self) -> None:
        with self.assertRaises(KeyError):
            preset("owomide_products_v1")


if __name__ == "__main__":
    unittest.main()
