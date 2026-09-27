"""Go-live readiness for a pilot organisation's first data files (Journey J3, day 1).

Reads the three import-template files (products, prices, costs) exactly as a design partner sends
them, and answers, before anything is imported: for how many products can Owómidé calculate a
margin today, and what stops the rest? Every problem names the file, the row and the column.

It uses the pricing engine for every calculation, so a margin shown here is the margin the product
will show. Nothing is corrected or guessed: a price without a tax basis, a cost of another basis,
unit or currency, and two current prices for one product are all reported, never resolved.

Release 1 scope (decision D-04): one organisation-wide price per product. Rows for a specific
location or channel are counted and set aside.

Usage:
    python -m owomide_data_pipeline.intelligence.readiness \\
        --products products.csv --prices prices.csv --costs costs.csv [--costs update.csv] \\
        --currency NGN --default-tax inclusive --default-tax-rate 7.5 --cost-basis landed \\
        --at 2026-10-01T00:00:00+01:00 [--min-margin 12] [--json]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime
from fractions import Fraction
from pathlib import Path

from owomide_data_pipeline.intelligence.build import Member
from owomide_data_pipeline.intelligence.pricing import (
    Unavailable,
    exact,
    gross_margin_pct,
    tax_exclusive,
)

READINESS_VERSION = "readiness-v1"

_DECIMAL = re.compile(r"^\d+(\.\d+)?$")
_NEGATIVE = re.compile(r"^-\s*\d")
_CURRENCY = re.compile(r"^[A-Z]{3}$")
_TRUE = frozenset({"true", "yes", "y", "1", "inclusive"})
_FALSE = frozenset({"false", "no", "n", "0", "exclusive"})

READY = "ready"
READY_WITH_GAPS = "ready_with_gaps"
NOT_READY = "not_ready"


@dataclass(frozen=True, slots=True)
class Settings:
    """The organisation's onboarding choices (catalog.pricing_settings)."""

    currency: str
    default_tax_inclusive: bool | None
    default_tax_rate_pct: Fraction | None
    cost_basis: str
    at: datetime
    min_margin_pct: Fraction | None = None
    # A pilot is "ready" when at least this share of products has a computable margin.
    ready_share: Fraction = Fraction(95, 100)


@dataclass(frozen=True, slots=True)
class Problem:
    file: str
    row: int | None
    column: str | None
    code: str
    severity: str  # "error" | "warning" | "info"
    message: str


@dataclass(slots=True)
class Report:
    version: str
    verdict: str
    products: int
    margin_ready: int
    margin_ready_pct: str
    unable_to_evaluate: dict[str, int]
    below_cost: int
    below_min_margin: int | None
    set_aside_rows: dict[str, int]
    problems: list[Problem] = field(default_factory=list)
    # The product codes behind each unable_to_evaluate count, in code order.
    unable_products: dict[str, list[str]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


# ------------------------------------------------------------------ parsing helpers


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [
            {k.strip(): (v or "").strip() for k, v in row.items() if k}
            for row in csv.DictReader(handle)
        ]


def _row_number(index: int) -> int:
    return index + 2  # the header is row 1


def _timestamp(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


class _Collector:
    def __init__(self) -> None:
        self.problems: list[Problem] = []

    def add(
        self, file: str, row: int | None, column: str | None, code: str, severity: str, message: str
    ) -> None:
        self.problems.append(Problem(file, row, column, code, severity, message))


def _require(
    out: _Collector, file: str, row: int, record: Mapping[str, str], columns: Iterable[str]
) -> bool:
    ok = True
    for column in columns:
        if not record.get(column):
            out.add(file, row, column, "missing_value", "error", f"{column} is required.")
            ok = False
    return ok


def _period(
    out: _Collector, file: str, row: int, record: Mapping[str, str]
) -> tuple[datetime, datetime | None] | None:
    start = _timestamp(record.get("effective_from", ""))
    if start is None:
        out.add(
            file,
            row,
            "effective_from",
            "invalid_date",
            "error",
            "effective_from must be a date and time with a time zone, "
            "e.g. 2026-09-01T00:00:00+01:00.",
        )
        return None
    raw_end = record.get("effective_to", "")
    end = _timestamp(raw_end) if raw_end else None
    if raw_end and (end is None or end <= start):
        out.add(
            file,
            row,
            "effective_to",
            "invalid_date",
            "error",
            "effective_to must be a date and time with a time zone, after effective_from.",
        )
        return None
    return start, end


def _current(period: tuple[datetime, datetime | None], at: datetime) -> bool:
    start, end = period
    return start <= at and (end is None or at < end)


# ------------------------------------------------------------------ the three files


@dataclass(frozen=True, slots=True)
class _Price:
    row: int
    amount: Fraction
    tax_inclusive: bool | None
    rate_pct: Fraction | None


@dataclass(frozen=True, slots=True)
class _Cost:
    row: int
    amount: Fraction


def _products(rows: Sequence[Mapping[str, str]], out: _Collector) -> dict[str, str]:
    """Returns sku_code -> selling unit for every valid, unduplicated product."""
    seen: dict[str, list[int]] = defaultdict(list)
    units: dict[str, str] = {}
    for index, record in enumerate(rows):
        row = _row_number(index)
        if not _require(
            out, "products", row, record, ("sku_code", "product_name", "category", "unit")
        ):
            continue
        pack = record.get("pack_size", "")
        if pack and (not _DECIMAL.match(pack) or exact(pack) <= 0):
            out.add(
                "products",
                row,
                "pack_size",
                "invalid_number",
                "error",
                "pack_size must be a positive number.",
            )
            continue
        seen[record["sku_code"]].append(row)
        units[record["sku_code"]] = record["unit"].lower()
    for sku, found in seen.items():
        if len(found) > 1:
            for row in found:
                out.add(
                    "products",
                    row,
                    "sku_code",
                    "duplicate_in_file",
                    "error",
                    f"{sku} appears on rows {', '.join(map(str, found))}. "
                    "Keep one row per product.",
                )
            del units[sku]
    return units


def _prices(
    rows: Sequence[Mapping[str, str]],
    units: Mapping[str, str],
    s: Settings,
    out: _Collector,
    file: str = "prices",
) -> tuple[dict[str, _Price], Counter[str]]:
    current: dict[str, list[_Price]] = defaultdict(list)
    set_aside: Counter[str] = Counter()
    for index, record in enumerate(rows):
        row = _row_number(index)
        if not _require(
            out, file, row, record, ("sku_code", "price", "currency", "effective_from")
        ):
            continue
        sku = record["sku_code"]
        if sku not in units:
            out.add(
                file, row, "sku_code", "unknown_sku", "error", f"{sku} is not in the products file."
            )
            continue
        if _NEGATIVE.match(record["price"]):
            out.add(file, row, "price", "negative_value", "error", "price must not be negative.")
            continue
        if not _DECIMAL.match(record["price"]):
            out.add(
                file,
                row,
                "price",
                "invalid_number",
                "error",
                "price must be digits with one decimal point: no commas, currency signs or spaces.",
            )
            continue
        currency = record["currency"].upper()
        if not _CURRENCY.match(currency):
            out.add(
                file,
                row,
                "currency",
                "invalid_currency",
                "error",
                "currency must be a three-letter code.",
            )
            continue
        flag = record.get("tax_inclusive", "").lower()
        if flag and flag not in _TRUE | _FALSE:
            out.add(
                file,
                row,
                "tax_inclusive",
                "invalid_tax_flag",
                "error",
                "tax_inclusive must be true or false.",
            )
            continue
        raw_rate = record.get("tax_rate_pct", "").removesuffix("%").strip()
        if raw_rate and (not _DECIMAL.match(raw_rate) or exact(raw_rate) > 100):
            out.add(
                file,
                row,
                "tax_rate_pct",
                "invalid_tax_rate",
                "error",
                "tax_rate_pct must be between 0 and 100.",
            )
            continue
        period = _period(out, file, row, record)
        if period is None:
            continue
        if record.get("location") or record.get("channel"):
            set_aside["location_or_channel_price"] += 1
            continue
        if currency != s.currency:
            out.add(
                file,
                row,
                "currency",
                "currency_incompatible",
                "warning",
                f"price is in {currency}; the organisation prices in {s.currency}. "
                "Kept as context only.",
            )
            continue
        if not _current(period, s.at):
            set_aside["not_current_price"] += 1
            continue
        inclusive: bool | None = (flag in _TRUE) if flag else s.default_tax_inclusive
        rate = exact(raw_rate) if raw_rate else (None if flag else s.default_tax_rate_pct)
        current[sku].append(_Price(row, exact(record["price"]), inclusive, rate))

    chosen: dict[str, _Price] = {}
    for sku, prices in current.items():
        if len(prices) > 1:
            rows_text = ", ".join(str(p.row) for p in prices)
            for price in prices:
                out.add(
                    file,
                    price.row,
                    "effective_from",
                    "duplicate_in_file",
                    "error",
                    f"{sku} has {len(prices)} current prices (rows {rows_text}). "
                    "Both are held until you say which applies.",
                )
            continue
        chosen[sku] = prices[0]
    return chosen, set_aside


def _costs(
    rows: Sequence[Mapping[str, str]],
    units: Mapping[str, str],
    s: Settings,
    out: _Collector,
    file: str = "costs",
) -> tuple[dict[str, _Cost], Counter[str]]:
    current: dict[str, list[_Cost]] = defaultdict(list)
    set_aside: Counter[str] = Counter()
    for index, record in enumerate(rows):
        row = _row_number(index)
        required = ("sku_code", "cost", "currency", "cost_basis", "unit", "effective_from")
        if not _require(out, file, row, record, required):
            continue
        sku = record["sku_code"]
        if sku not in units:
            out.add(
                file, row, "sku_code", "unknown_sku", "error", f"{sku} is not in the products file."
            )
            continue
        if _NEGATIVE.match(record["cost"]):
            out.add(file, row, "cost", "negative_value", "error", "cost must not be negative.")
            continue
        if not _DECIMAL.match(record["cost"]):
            out.add(
                file,
                row,
                "cost",
                "invalid_number",
                "error",
                "cost must be digits with one decimal point: no commas, currency signs or spaces.",
            )
            continue
        period = _period(out, file, row, record)
        if period is None:
            continue
        if not _CURRENCY.match(record["currency"].upper()):
            out.add(
                file,
                row,
                "currency",
                "invalid_currency",
                "error",
                "currency must be a three-letter code.",
            )
            continue
        if record.get("location"):
            set_aside["location_cost"] += 1
            continue
        if record["cost_basis"].lower() != s.cost_basis:
            set_aside[f"cost_basis_{record['cost_basis'].lower()}"] += 1
            continue
        if record["currency"].upper() != s.currency:
            out.add(
                file,
                row,
                "currency",
                "currency_incompatible",
                "warning",
                f"cost is in {record['currency'].upper()}; prices are in {s.currency}. "
                "Not converted, not used.",
            )
            continue
        if record["unit"].lower() != units[sku]:
            out.add(
                file,
                row,
                "unit",
                "cost_unit_incompatible",
                "warning",
                f"cost is per {record['unit']} but {sku} is sold per {units[sku]}. "
                "Not used for margins.",
            )
            continue
        amount = exact(record["cost"])
        if amount == 0:
            out.add(
                file,
                row,
                "cost",
                "zero_cost",
                "warning",
                "a cost of 0 means the product costs nothing, so its margin would show as 100%. "
                "Leave the row out if the cost is unknown.",
            )
        if not _current(period, s.at):
            set_aside["not_current_cost"] += 1
            continue
        current[sku].append(_Cost(row, amount))

    chosen: dict[str, _Cost] = {}
    for sku, costs in current.items():
        if len(costs) > 1:
            rows_text = ", ".join(str(c.row) for c in costs)
            for cost in costs:
                out.add(
                    file,
                    cost.row,
                    "effective_from",
                    "duplicate_in_file",
                    "error",
                    f"{sku} has {len(costs)} current {s.cost_basis} costs (rows {rows_text}). "
                    "Both are held until you say which applies.",
                )
            continue
        chosen[sku] = costs[0]
    return chosen, set_aside


# ------------------------------------------------------------------ assessment


Files = Sequence[tuple[str, Sequence[Mapping[str, str]]]]


def _read(
    products: Sequence[Mapping[str, str]], prices: Files, costs: Files, settings: Settings
) -> tuple[
    _Collector, dict[str, str], dict[str, _Price], dict[str, _Cost], Counter[str], Counter[str]
]:
    out = _Collector()
    units = _products(products, out)
    current_prices: dict[str, _Price] = {}
    current_costs: dict[str, _Cost] = {}
    price_aside: Counter[str] = Counter()
    cost_aside: Counter[str] = Counter()
    for name, rows in prices:
        chosen, aside = _prices(rows, units, settings, out, name)
        current_prices.update(chosen)
        price_aside += aside
    for name, rows in costs:
        chosen, aside = _costs(rows, units, settings, out, name)
        current_costs.update(chosen)
        cost_aside += aside
    return out, units, current_prices, current_costs, price_aside, cost_aside


def current_members(
    products: Sequence[Mapping[str, str]], prices: Files, costs: Files, settings: Settings
) -> tuple[list[Member], list[Problem]]:
    """The organisation-wide scope members the files describe at ``settings.at``, one per valid
    product, read exactly as ``assess`` reads them. A missing record is an ``Unavailable`` value
    with the Catalog reason, never a zero."""
    out, units, current_prices, current_costs, _, _ = _read(products, prices, costs, settings)
    members: list[Member] = []
    for sku in sorted(units):
        price = current_prices.get(sku)
        cost = current_costs.get(sku)
        members.append(
            Member(
                sku_code=sku,
                current_price=price.amount if price else Unavailable("no_applicable_price_record"),
                tax_inclusive=price.tax_inclusive if price else settings.default_tax_inclusive,
                tax_rate_pct=price.rate_pct if price else settings.default_tax_rate_pct,
                cost=cost.amount if cost else Unavailable("no_applicable_cost_record"),
            )
        )
    return members, out.problems


def assess(
    products: Sequence[Mapping[str, str]],
    prices: Files,
    costs: Files,
    settings: Settings,
) -> Report:
    """Prices and costs are (file name, rows) pairs in import order. Within one file, two current
    records for a product are ambiguous (DATA-003). A later file replaces an earlier file's current
    record for the same product, as a later import supersedes an earlier one."""
    out, units, current_prices, current_costs, price_aside, cost_aside = _read(
        products, prices, costs, settings
    )

    unable: Counter[str] = Counter()
    unable_products: dict[str, list[str]] = {}
    ready = below_cost = below_min = 0
    for sku in sorted(units):
        price = current_prices.get(sku)
        cost = current_costs.get(sku)
        if price is None:
            unable["no_applicable_price_record"] += 1
            unable_products.setdefault("no_applicable_price_record", []).append(sku)
            continue
        if cost is None:
            unable["no_applicable_cost_record"] += 1
            unable_products.setdefault("no_applicable_cost_record", []).append(sku)
            continue
        margin = gross_margin_pct(
            tax_exclusive(price.amount, price.tax_inclusive, price.rate_pct), cost.amount
        )
        if isinstance(margin, Unavailable):
            unable[margin.reason] += 1
            unable_products.setdefault(margin.reason, []).append(sku)
            continue
        ready += 1
        if margin < 0:
            below_cost += 1
        if settings.min_margin_pct is not None and margin < settings.min_margin_pct:
            below_min += 1

    if unable["tax_basis_unknown"]:
        out.add(
            "prices",
            None,
            "tax_inclusive",
            "tax_basis_missing",
            "error",
            f"{unable['tax_basis_unknown']} prices do not say whether they include VAT and the "
            "organisation has no default. Set the default or fill the column.",
        )
    if unable["tax_rate_missing"]:
        out.add(
            "prices",
            None,
            "tax_rate_pct",
            "tax_rate_missing_for_inclusive_price",
            "warning",
            f"{unable['tax_rate_missing']} VAT-inclusive prices have no rate, "
            "so their margins show as Unable to Evaluate.",
        )

    total = len(units)
    share = Fraction(ready, total) if total else Fraction(0)
    product_errors = any(p.file == "products" and p.severity == "error" for p in out.problems)
    if total == 0 or product_errors or share < Fraction(1, 2):
        verdict = NOT_READY
    elif share >= settings.ready_share and not any(p.severity == "error" for p in out.problems):
        verdict = READY
    else:
        verdict = READY_WITH_GAPS

    return Report(
        version=READINESS_VERSION,
        verdict=verdict,
        products=total,
        margin_ready=ready,
        margin_ready_pct=f"{float(share * 100):.1f}",
        unable_to_evaluate=dict(sorted(unable.items())),
        unable_products=dict(sorted(unable_products.items())),
        below_cost=below_cost,
        below_min_margin=below_min if settings.min_margin_pct is not None else None,
        set_aside_rows=dict(sorted((price_aside + cost_aside).items())),
        problems=out.problems,
    )


def summary(report: Report) -> str:
    lines = [
        f"Verdict: {report.verdict.replace('_', ' ')}",
        f"Products: {report.products}",
        f"Margin can be calculated today: {report.margin_ready} ({report.margin_ready_pct}%)",
    ]
    for reason, count in report.unable_to_evaluate.items():
        lines.append(f"  Unable to Evaluate, {reason.replace('_', ' ')}: {count}")
    lines.append(f"Below cost after removing VAT: {report.below_cost}")
    if report.below_min_margin is not None:
        lines.append(f"Below the minimum margin: {report.below_min_margin}")
    for reason, count in report.set_aside_rows.items():
        lines.append(f"Rows set aside ({reason.replace('_', ' ')}): {count}")
    by_code = Counter((p.severity, p.code) for p in report.problems)
    if by_code:
        lines.append("Problems:")
        for (severity, code), count in sorted(by_code.items()):
            lines.append(f"  {severity}: {code.replace('_', ' ')} x{count}")
    return "\n".join(lines)


# Plain-English explanations for the shareable report. Every code the checker emits has one.
_PROBLEM_TEXT = {
    "missing_value": "A required column is empty.",
    "invalid_number": "A number is written with commas, currency signs, spaces or letters. "
    "Use digits and one decimal point, e.g. 1075.00.",
    "negative_value": "A price or cost is negative.",
    "invalid_currency": "The currency is not a three-letter code such as NGN.",
    "invalid_date": "A date is missing its time, its time zone, or ends before it starts. "
    "Use e.g. 2026-09-01T00:00:00+01:00.",
    "invalid_tax_flag": "tax_inclusive must be true or false.",
    "invalid_tax_rate": "tax_rate_pct must be a percentage between 0 and 100, e.g. 7.5.",
    "unknown_sku": "The product code is not in the products file.",
    "duplicate_in_file": "The same product appears more than once. Both rows are held until "
    "you say which is right.",
    "currency_incompatible": "The amount is in a different currency. It is kept for reference "
    "and not converted.",
    "cost_unit_incompatible": "The cost is for a different unit than the product is sold in, "
    "so it is not used for margins.",
    "zero_cost": "A cost of 0 would show a 100% margin. Leave the row out if the cost is unknown.",
    "tax_basis_missing": "Prices do not say whether they include VAT, and no default is set.",
    "tax_rate_missing_for_inclusive_price": "VAT-inclusive prices have no VAT rate.",
}
_UNABLE_TEXT = {
    "no_applicable_price_record": "no current price",
    "no_applicable_cost_record": "no usable cost",
    "tax_basis_unknown": "the price does not say whether it includes VAT",
    "tax_rate_missing": "the price includes VAT but has no rate",
    "price_not_positive": "the price is zero",
    "cost_not_positive": "the cost is zero",
}
_VERDICT_TEXT = {
    READY: "Ready. The files can be imported as they are.",
    READY_WITH_GAPS: "Ready with gaps. The files can be imported; the products listed below "
    "show as Unable to Evaluate, and rows marked Must fix are left out, until they are fixed.",
    NOT_READY: "Not ready. Please fix the problems below and send the files again.",
}


def markdown(report: Report, settings: Settings, title: str) -> str:
    """A report to send to the design partner: numbers, then each problem with its rows."""
    lines = [
        f"# {title}",
        "",
        f"Checked {settings.at.date().isoformat()} against: prices in {settings.currency}, "
        f"{settings.cost_basis} costs"
        + (
            f", prices {'including' if settings.default_tax_inclusive else 'excluding'} VAT "
            "unless a row says otherwise"
            if settings.default_tax_inclusive is not None
            else ""
        )
        + ".",
        "",
        f"**{_VERDICT_TEXT[report.verdict]}**",
        "",
        "| | Products |",
        "|---|---|",
        f"| In the products file | {report.products:,} |",
        f"| Margin can be calculated today | {report.margin_ready:,} "
        f"({report.margin_ready_pct}%) |",
    ]
    for reason, count in report.unable_to_evaluate.items():
        lines.append(f"| Unable to Evaluate: {_UNABLE_TEXT.get(reason, reason)} | {count:,} |")
    lines.append(f"| Below cost once VAT is removed | {report.below_cost} |")
    if report.below_min_margin is not None and settings.min_margin_pct is not None:
        lines.append(
            f"| Below the {float(settings.min_margin_pct):g}% minimum margin | "
            f"{report.below_min_margin} |"
        )
    if report.unable_products:
        lines += ["", "## Products whose margin cannot be calculated yet", ""]
        for reason, skus in report.unable_products.items():
            shown = ", ".join(skus[:25]) + (f" and {len(skus) - 25} more" if len(skus) > 25 else "")
            lines.append(f"- {_UNABLE_TEXT.get(reason, reason).capitalize()}: {shown}")
    groups: dict[tuple[str, str, str], list[int | None]] = {}
    for problem in report.problems:
        groups.setdefault((problem.severity, problem.file, problem.code), []).append(problem.row)
    if groups:
        lines += ["", "## What to fix", "", "| File | Problem | Rows |", "|---|---|---|"]
        order = {"error": 0, "warning": 1, "info": 2}
        for (severity, file, code), rows in sorted(
            groups.items(), key=lambda g: (order[g[0][0]], g[0][1], g[0][2])
        ):
            numbered = sorted({r for r in rows if r is not None})
            shown = ", ".join(map(str, numbered[:12])) + (
                f" and {len(numbered) - 12} more" if len(numbered) > 12 else ""
            )
            label = "Must fix" if severity == "error" else "Check"
            lines.append(
                f"| {file} | {label}: {_PROBLEM_TEXT.get(code, code)} | {shown or 'whole file'} |"
            )
    if report.set_aside_rows:
        lines += [
            "",
            "## Kept for later, not used now",
            "",
            "These rows are fine. They are not used in the first release (one organisation-wide "
            "price per product, and the chosen cost basis only), or they take effect later.",
            "",
        ]
        for reason, count in report.set_aside_rows.items():
            lines.append(f"- {reason.replace('_', ' ')}: {count} rows")
    lines += ["", f"_Owómidé readiness check {report.version}._", ""]
    return "\n".join(lines)


def _tax_flag(value: str) -> bool | None:
    if value == "none":
        return None
    return value == "inclusive"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument(
        "--prices", type=Path, action="append", required=True, help="repeat in import order"
    )
    parser.add_argument(
        "--costs", type=Path, action="append", required=True, help="repeat in import order"
    )
    parser.add_argument("--currency", required=True)
    parser.add_argument("--default-tax", choices=("inclusive", "exclusive", "none"), default="none")
    parser.add_argument("--default-tax-rate", help="percent, e.g. 7.5")
    parser.add_argument("--cost-basis", default="landed")
    parser.add_argument("--at", required=True, help="ISO date-time with time zone")
    parser.add_argument("--min-margin", help="percent, e.g. 12")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true")
    output.add_argument("--markdown", action="store_true", help="a report to share")
    parser.add_argument("--title", default="Data readiness report")
    args = parser.parse_args(argv)

    at = _timestamp(args.at)
    if at is None:
        parser.error("--at must be an ISO date-time with a time zone")
    settings = Settings(
        currency=args.currency.upper(),
        default_tax_inclusive=_tax_flag(args.default_tax),
        default_tax_rate_pct=exact(args.default_tax_rate) if args.default_tax_rate else None,
        cost_basis=args.cost_basis.lower(),
        at=at,
        min_margin_pct=exact(args.min_margin) if args.min_margin else None,
    )
    report = assess(
        load_csv(args.products),
        [(path.name, load_csv(path)) for path in args.prices],
        [(path.name, load_csv(path)) for path in args.costs],
        settings,
    )
    if args.json:
        json.dump(report.to_dict(), sys.stdout, indent=2)
        sys.stdout.write("\n")
    elif args.markdown:
        sys.stdout.write(markdown(report, settings, args.title))
    else:
        print(summary(report))
    return 0 if report.verdict != NOT_READY else 1


if __name__ == "__main__":
    raise SystemExit(main())
