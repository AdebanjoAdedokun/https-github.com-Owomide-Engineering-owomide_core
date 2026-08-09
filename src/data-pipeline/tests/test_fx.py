from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from owomide_data_pipeline.intelligence.fx import (
    FxCalculator,
    FxRateEntry,
    FxRateNotFoundError,
    FxRateSnapshot,
    InvalidFxRequestError,
)


class FakeStore:
    def __init__(self, snapshot: FxRateSnapshot | None = None) -> None:
        self.snapshot = snapshot
        self.recorded: dict | None = None
        self.queries: list[dict] = []

    def record_snapshot(self, **values):
        self.recorded = values
        now = datetime(2026, 8, 2, 12, tzinfo=UTC)
        return (
            FxRateSnapshot(
                id=uuid4(),
                org_id=values["org_id"],
                idempotency_key=values["idempotency_key"],
                source=values["source"],
                base_currency=values["base_currency"],
                effective_at=values["effective_at"],
                recorded_at=now,
                rates=tuple(values["rates"]),
                provider_ref=values["provider_ref"],
                checksum_sha256=values["checksum_sha256"],
                created_by=values["user_id"],
            ),
            False,
        )

    def find_snapshot(self, **values):
        self.queries.append(values)
        return self.snapshot


def snapshot() -> FxRateSnapshot:
    return FxRateSnapshot(
        id=uuid4(),
        org_id="org-a",
        idempotency_key="rates-2026-08-01",
        source="treasury",
        base_currency="EUR",
        effective_at=datetime(2026, 8, 1, 16, tzinfo=UTC),
        recorded_at=datetime(2026, 8, 1, 17, tzinfo=UTC),
        rates=(
            FxRateEntry("NGN", Decimal("1800")),
            FxRateEntry("USD", Decimal("1.2")),
        ),
        provider_ref="daily-close",
        checksum_sha256="a" * 64,
        created_by="user-a",
    )


class FxCalculatorTest(unittest.TestCase):
    def test_cross_rate_and_minor_unit_conversion_are_decimal_exact(self) -> None:
        store = FakeStore(snapshot())
        calculator = FxCalculator(store)

        result = calculator.convert(
            org_id="org-a",
            amount_minor=12_345,
            source_currency="USD",
            target_currency="NGN",
            rate_source_name="treasury",
            effective_at=datetime(2026, 8, 2, tzinfo=UTC),
            recorded_as_of=datetime(2026, 8, 2, tzinfo=UTC),
        )

        self.assertEqual(result.quote.rate, Decimal("1500.000000000000000000"))
        self.assertEqual(result.exact_target_amount, Decimal("185175.000000000000000000"))
        self.assertEqual(result.target_amount_minor, 18_517_500)
        self.assertEqual((result.source_minor_unit, result.target_minor_unit), (2, 2))
        self.assertEqual(store.queries[0]["max_age_seconds"], 7 * 24 * 60 * 60)

    def test_half_even_rounding_respects_zero_and_three_decimal_currencies(self) -> None:
        rate_snapshot = replace(
            snapshot(),
            base_currency="JPY",
            rates=(FxRateEntry("KWD", Decimal("0.0025")),),
        )
        result = FxCalculator(FakeStore(rate_snapshot)).convert(
            org_id="org-a",
            amount_minor=1,
            source_currency="JPY",
            target_currency="KWD",
            rate_source_name="treasury",
            effective_at=datetime(2026, 8, 2, tzinfo=UTC),
            recorded_as_of=datetime(2026, 8, 2, tzinfo=UTC),
        )

        self.assertEqual(result.exact_target_amount, Decimal("0.002500000000000000"))
        self.assertEqual(result.target_amount_minor, 2)
        self.assertEqual((result.source_minor_unit, result.target_minor_unit), (0, 3))

    def test_same_currency_is_identity_without_a_snapshot_lookup(self) -> None:
        store = FakeStore()
        calculator = FxCalculator(store)

        result = calculator.convert(
            org_id="org-a",
            amount_minor=-1050,
            source_currency="GBP",
            target_currency="gbp",
            rate_source_name="manual",
            effective_at=datetime(2026, 8, 2, tzinfo=UTC),
        )

        self.assertEqual(result.target_amount_minor, -1050)
        self.assertIsNone(result.quote.snapshot_id)
        self.assertEqual(store.queries, [])

    def test_snapshot_input_is_normalized_sorted_and_checksummed(self) -> None:
        store = FakeStore()
        calculator = FxCalculator(store)

        recorded, replayed = calculator.record_snapshot(
            org_id="org-a",
            user_id="user-a",
            idempotency_key=" close-1 ",
            source=" Treasury ",
            base_currency="eur",
            effective_at=datetime(2026, 8, 1, 16, tzinfo=UTC),
            rates=(("usd", "1.2000"), ("NGN", "1800")),
            provider_ref=" close ",
        )

        self.assertFalse(replayed)
        self.assertEqual(recorded.source, "treasury")
        self.assertEqual([entry.currency for entry in recorded.rates], ["NGN", "USD"])
        self.assertEqual(len(store.recorded["checksum_sha256"]), 64)

    def test_invalid_rate_shapes_and_missing_history_fail_actionably(self) -> None:
        calculator = FxCalculator(FakeStore())
        with self.assertRaisesRegex(InvalidFxRequestError, "plain decimals"):
            calculator.record_snapshot(
                org_id="org-a",
                user_id="user-a",
                idempotency_key="bad",
                source="manual",
                base_currency="USD",
                effective_at=datetime(2026, 8, 1, tzinfo=UTC),
                rates=(("NGN", "1e3"),),
            )
        with self.assertRaisesRegex(FxRateNotFoundError, "No manual FX rate"):
            calculator.quote(
                org_id="org-a",
                source_currency="USD",
                target_currency="NGN",
                rate_source_name="manual",
                effective_at=datetime(2026, 8, 2, tzinfo=UTC),
                recorded_as_of=datetime(2026, 8, 2, tzinfo=UTC),
            )

        with self.assertRaisesRegex(InvalidFxRequestError, "not supported"):
            calculator.quote(
                org_id="org-a",
                source_currency="ZZZ",
                target_currency="NGN",
                rate_source_name="manual",
                effective_at=datetime(2026, 8, 2, tzinfo=UTC),
            )

    def test_cross_rate_below_supported_precision_is_rejected_actionably(self) -> None:
        rate_snapshot = replace(
            snapshot(),
            base_currency="EUR",
            rates=(
                FxRateEntry("USD", Decimal("99999999999999999999")),
                FxRateEntry("NGN", Decimal("0.000000000000000001")),
            ),
        )

        with self.assertRaisesRegex(InvalidFxRequestError, "below the supported precision"):
            FxCalculator(FakeStore(rate_snapshot)).quote(
                org_id="org-a",
                source_currency="USD",
                target_currency="NGN",
                rate_source_name="manual",
                effective_at=datetime(2026, 8, 2, tzinfo=UTC),
            )


if __name__ == "__main__":
    unittest.main()
