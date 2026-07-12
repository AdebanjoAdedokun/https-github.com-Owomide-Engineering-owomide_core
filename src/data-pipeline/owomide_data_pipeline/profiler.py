from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from owomide_data_pipeline.errors import InvalidImportError

_INTEGER = re.compile(r"^[+-]?(?:0|[1-9]\d*)$")
_DECIMAL = re.compile(r"^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$")
_MONEY = re.compile(
    r"^(?P<prefix>[A-Za-z]{3}|[$£€₦¥])?\s*"
    r"(?P<number>[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)"
    r"\s*(?P<suffix>[A-Za-z]{3})?$"
)
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_YMD_SLASH = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")
_DAY_FIRST = re.compile(r"^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$")
_CURRENCY_CODES = frozenset(
    {
        "AED",
        "AUD",
        "BRL",
        "CAD",
        "CHF",
        "CNY",
        "DKK",
        "EGP",
        "EUR",
        "GBP",
        "GHS",
        "HKD",
        "IDR",
        "INR",
        "JPY",
        "KES",
        "KRW",
        "MAD",
        "MXN",
        "NGN",
        "NOK",
        "NZD",
        "PLN",
        "SAR",
        "SEK",
        "SGD",
        "TRY",
        "UGX",
        "USD",
        "XOF",
        "ZAR",
    }
)
_CURRENCY_SYMBOLS = {"£": "GBP", "€": "EUR", "₦": "NGN", "$": "$", "¥": "¥"}


@dataclass(frozen=True, slots=True)
class ProfiledColumn:
    column_name: str
    ordinal_position: int
    detected_type: str
    sample_values: tuple[str, ...]
    currency_hint: str | None
    date_hint: str | None
    suggested_mapping: str | None
    confidence: Decimal


@dataclass(frozen=True, slots=True)
class _MappingRule:
    target: str
    aliases: frozenset[str]
    expected_types: frozenset[str]


def _aliases(*values: str) -> frozenset[str]:
    return frozenset(values)


_MAPPING_RULES = (
    _MappingRule(
        "sku.sku_code",
        _aliases(
            "sku",
            "sku code",
            "item code",
            "item number",
            "product code",
            "stock code",
            "stock keeping unit",
        ),
        frozenset({"string", "integer"}),
    ),
    _MappingRule(
        "product.name",
        _aliases("product", "product name", "item name", "description", "product description"),
        frozenset({"string"}),
    ),
    _MappingRule(
        "price_record.price_minor",
        _aliases(
            "price",
            "selling price",
            "sale price",
            "retail price",
            "list price",
            "unit price",
        ),
        frozenset({"integer", "decimal"}),
    ),
    _MappingRule(
        "cost_record.cost_minor",
        _aliases("cost", "cost price", "unit cost", "purchase price", "buying price"),
        frozenset({"integer", "decimal"}),
    ),
    _MappingRule(
        "price_record.currency",
        _aliases("currency", "currency code", "iso currency", "price currency"),
        frozenset({"string"}),
    ),
    _MappingRule(
        "channel.code",
        _aliases("channel", "channel code", "sales channel", "price list", "price book"),
        frozenset({"string", "integer"}),
    ),
    _MappingRule(
        "price_record.effective_at",
        _aliases(
            "effective date",
            "effective at",
            "price date",
            "start date",
            "valid from",
        ),
        frozenset({"date", "datetime"}),
    ),
    _MappingRule(
        "sku.identifier",
        _aliases("gtin", "ean", "upc", "barcode", "product identifier"),
        frozenset({"string", "integer"}),
    ),
    _MappingRule(
        "sku.pack_size",
        _aliases("pack size", "case size", "pack quantity", "pack qty"),
        frozenset({"integer", "decimal"}),
    ),
)


def _normalize_header(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z0-9]+", ascii_value.lower()))


def _mapping_for(header: str, detected_type: str) -> tuple[str | None, Decimal]:
    normalized = _normalize_header(header)
    for rule in _MAPPING_RULES:
        if normalized in rule.aliases:
            match = rule
            confidence = Decimal("0.9800")
            break
    else:
        header_tokens = frozenset(normalized.split())
        fuzzy_matches = [
            rule
            for rule in _MAPPING_RULES
            if any(
                frozenset(alias.split()).issubset(header_tokens)
                for alias in rule.aliases
                if len(alias.split()) >= 2
            )
        ]
        if len(fuzzy_matches) != 1:
            return None, Decimal("0")
        match = fuzzy_matches[0]
        confidence = Decimal("0.8600")

    if detected_type == "empty":
        confidence -= Decimal("0.1000")
    elif detected_type == "mixed":
        confidence -= Decimal("0.1500")
    elif detected_type not in match.expected_types:
        confidence -= Decimal("0.2000")
    return match.target, max(confidence, Decimal("0.5000"))


def _date_type_and_hint(raw: str) -> tuple[str, str | None] | None:
    if _ISO_DATE.fullmatch(raw):
        try:
            date.fromisoformat(raw)
        except ValueError:
            return None
        return "date", "YYYY-MM-DD"
    if "T" in raw or (" " in raw and ":" in raw):
        try:
            datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
        else:
            return "datetime", "ISO-8601"
    if match := _YMD_SLASH.fullmatch(raw):
        try:
            date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            return None
        return "date", "YYYY/MM/DD"
    if match := _DAY_FIRST.fullmatch(raw):
        first, separator, second, year = match.groups()
        first_number = int(first)
        second_number = int(second)
        possible: list[tuple[str, date]] = []
        for hint, month, day in (
            (f"DD{separator}MM{separator}YYYY", second_number, first_number),
            (f"MM{separator}DD{separator}YYYY", first_number, second_number),
        ):
            try:
                possible.append((hint, date(int(year), month, day)))
            except ValueError:
                continue
        if not possible:
            return None
        hint = possible[0][0] if len(possible) == 1 else None
        return "date", hint
    return None


def _currency_hint(raw: str) -> str | None:
    for token in re.findall(r"[A-Za-z]{3}", raw):
        code = token.upper()
        if code in _CURRENCY_CODES:
            return code
    for symbol, hint in _CURRENCY_SYMBOLS.items():
        if symbol in raw:
            return hint
    return None


def _finite_decimal(raw: str) -> bool:
    try:
        return Decimal(raw.replace(",", "")).is_finite()
    except InvalidOperation:
        return False


def _classify(value: object) -> tuple[str | None, str | None, str | None]:
    if value is None:
        return None, None, None
    if isinstance(value, bool):
        return "boolean", None, None
    if isinstance(value, int):
        return "integer", None, None
    if isinstance(value, float | Decimal):
        if isinstance(value, float) and not math.isfinite(value):
            return "string", None, None
        return "decimal", None, None

    raw = str(value).strip()
    if not raw:
        return None, None, None
    if date_result := _date_type_and_hint(raw):
        detected_type, date_hint = date_result
        return detected_type, _currency_hint(raw), date_hint
    lowered = raw.lower()
    if lowered in {"true", "false", "yes", "no"}:
        return "boolean", None, None
    if _INTEGER.fullmatch(raw):
        return "integer", _currency_hint(raw), None
    if _DECIMAL.fullmatch(raw) and _finite_decimal(raw):
        return "decimal", _currency_hint(raw), None
    if match := _MONEY.fullmatch(raw):
        prefix = match.group("prefix")
        suffix = match.group("suffix")
        currency = _currency_hint(prefix or suffix or raw)
        if currency is not None and _finite_decimal(match.group("number")):
            return "decimal", currency, None
    return "string", _currency_hint(raw), None


def _sample(value: object, max_chars: int) -> str | None:
    if value is None:
        return None
    rendered = ("true" if value else "false") if isinstance(value, bool) else str(value)
    if not rendered.strip():
        return None
    return rendered[:max_chars]


def _detected_type(counts: Counter[str]) -> str:
    types = frozenset(counts)
    if not types:
        return "empty"
    if len(types) == 1:
        return next(iter(types))
    if types.issubset({"integer", "decimal"}):
        return "decimal"
    if types.issubset({"date", "datetime"}):
        return "datetime"
    return "mixed"


@dataclass(slots=True)
class _ColumnStats:
    name: str
    ordinal_position: int
    sample_limit: int
    sample_max_chars: int
    type_counts: Counter[str] = field(default_factory=Counter)
    currency_counts: Counter[str] = field(default_factory=Counter)
    date_hint_counts: Counter[str] = field(default_factory=Counter)
    samples: list[str] = field(default_factory=list)
    _sample_set: set[str] = field(default_factory=set)

    def observe(self, value: object) -> None:
        detected_type, currency_hint, date_hint = _classify(value)
        if detected_type is not None:
            self.type_counts[detected_type] += 1
        if currency_hint is not None:
            self.currency_counts[currency_hint] += 1
        if date_hint is not None:
            self.date_hint_counts[date_hint] += 1
        sample = _sample(value, self.sample_max_chars)
        if (
            sample is not None
            and sample not in self._sample_set
            and len(self.samples) < self.sample_limit
        ):
            self.samples.append(sample)
            self._sample_set.add(sample)

    def finish(self) -> ProfiledColumn:
        detected_type = _detected_type(self.type_counts)
        suggested_mapping, confidence = _mapping_for(self.name, detected_type)
        currency_hint = self.currency_counts.most_common(1)[0][0] if self.currency_counts else None
        date_hint = self.date_hint_counts.most_common(1)[0][0] if self.date_hint_counts else None
        return ProfiledColumn(
            column_name=self.name,
            ordinal_position=self.ordinal_position,
            detected_type=detected_type,
            sample_values=tuple(self.samples),
            currency_hint=currency_hint,
            date_hint=date_hint,
            suggested_mapping=suggested_mapping,
            confidence=confidence,
        )


class ColumnProfiler:
    """Builds bounded-memory, deterministic profiles while parsed rows stream past."""

    def __init__(self, *, sample_limit: int = 5, sample_max_chars: int = 200) -> None:
        if sample_limit < 1 or sample_max_chars < 1:
            raise ValueError("Profiler sample limits must be positive")
        self._sample_limit = sample_limit
        self._sample_max_chars = sample_max_chars
        self._columns: list[_ColumnStats] = []
        self._headers: tuple[str, ...] | None = None
        self._row_count = 0

    @property
    def row_count(self) -> int:
        return self._row_count

    def observe(self, raw_data: dict[str, object]) -> None:
        headers = tuple(raw_data)
        if self._headers is None:
            self._headers = headers
            self._columns = [
                _ColumnStats(
                    name=header,
                    ordinal_position=index,
                    sample_limit=self._sample_limit,
                    sample_max_chars=self._sample_max_chars,
                )
                for index, header in enumerate(headers, start=1)
            ]
        elif headers != self._headers:
            raise InvalidImportError("Parsed import rows do not have a consistent column layout")

        for column in self._columns:
            column.observe(raw_data[column.name])
        self._row_count += 1

    def finish(self) -> tuple[ProfiledColumn, ...]:
        if self._row_count == 0:
            raise InvalidImportError("Import file does not contain any data rows")
        return tuple(column.finish() for column in self._columns)
