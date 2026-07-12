from __future__ import annotations

import copy
import re
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation


class TransformationError(ValueError):
    pass


_MONEY = re.compile(
    r"^(?P<prefix>[A-Za-z]{3}|[$£€₦¥])?\s*"
    r"(?P<number>[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)"
    r"\s*(?P<suffix>[A-Za-z]{3})?$"
)
_CURRENCY_SYMBOLS = {"£": "GBP", "€": "EUR", "₦": "NGN"}
_TRUE_VALUES = frozenset({"1", "true", "yes", "y", "on", "inclusive", "included"})
_FALSE_VALUES = frozenset({"0", "false", "no", "n", "off", "exclusive", "excluded"})
_DATE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYY/MM/DD": "%Y/%m/%d",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "MM-DD-YYYY": "%m-%d-%Y",
}


def _decimal(value: object) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise TransformationError("expected a decimal value")
    try:
        result = Decimal(str(value).strip().replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise TransformationError("expected a decimal value") from exc
    if not result.is_finite():
        raise TransformationError("expected a finite decimal value")
    return result


def _currency(value: object, field: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z]{3}", value.strip()):
        raise TransformationError(f"{field} must be a three-letter currency code")
    return value.strip().upper()


def parse_money(value: object) -> tuple[Decimal, str | None]:
    if isinstance(value, int | Decimal) and not isinstance(value, bool):
        return _decimal(value), None
    if not isinstance(value, str) or not (match := _MONEY.fullmatch(value.strip())):
        raise TransformationError("expected money such as 1250.00 or NGN 1,250.00")
    amount = _decimal(match.group("number"))
    raw_currency = match.group("prefix") or match.group("suffix")
    if raw_currency is None:
        return amount, None
    if raw_currency in _CURRENCY_SYMBOLS:
        return amount, _CURRENCY_SYMBOLS[raw_currency]
    if raw_currency in {"$", "¥"}:
        raise TransformationError(
            f'currency symbol "{raw_currency}" is ambiguous; provide a three-letter code'
        )
    return amount, raw_currency.upper()


def decimal_to_minor_units(value: object, scale: int = 2) -> int:
    if isinstance(scale, bool) or not isinstance(scale, int) or not 0 <= scale <= 6:
        raise TransformationError("scale must be an integer between 0 and 6")
    amount = _decimal(value) * (Decimal(10) ** scale)
    integral = amount.to_integral_value()
    if amount != integral:
        raise TransformationError(f"value has more than {scale} decimal places")
    result = int(integral)
    if not -(2**63) <= result < 2**63:
        raise TransformationError("minor-unit value is outside the signed 64-bit range")
    return result


def parse_date(value: object, formats: Sequence[str] | None = None) -> str:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime(value.year, value.month, value.day, tzinfo=UTC)
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            raise TransformationError("expected a non-empty date")
        parsed = None
        requested = list(formats or ())
        if requested:
            for name in requested:
                pattern = _DATE_FORMATS.get(name)
                if pattern is None:
                    raise TransformationError(f'unsupported date format "{name}"')
                try:
                    parsed = datetime.strptime(raw, pattern).replace(tzinfo=UTC)
                    break
                except ValueError:
                    continue
        else:
            try:
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                if re.fullmatch(r"\d{4}/\d{1,2}/\d{1,2}", raw):
                    parsed = datetime.strptime(raw, "%Y/%m/%d").replace(tzinfo=UTC)
        if parsed is None:
            raise TransformationError("date is invalid or ambiguous; configure an explicit format")
    else:
        raise TransformationError("expected a date string")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_tax_flag(value: object) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    raise TransformationError("expected a recognised inclusive/exclusive boolean value")


def normalize_unit(value: object, aliases: Mapping[str, object] | None = None) -> str:
    normalized = str(value).strip().upper()
    if not normalized:
        raise TransformationError("unit must not be empty")
    alias_map = {
        str(key).strip().upper(): str(item).strip().upper() for key, item in (aliases or {}).items()
    }
    return alias_map.get(normalized, normalized)


def normalize_pack_size(value: object) -> int:
    number = _decimal(value)
    if number != number.to_integral_value() or number <= 0 or number > 2**31 - 1:
        raise TransformationError("pack size must be a positive whole number")
    return int(number)


def _get(document: Mapping[str, object], path: str) -> object:
    current: object = document
    for segment in path.split("."):
        if not isinstance(current, Mapping) or segment not in current:
            raise TransformationError(f'mapped field "{path}" is missing')
        current = current[segment]
    return current


def _set(document: dict[str, object], path: str, value: object) -> None:
    segments = path.split(".")
    current = document
    for segment in segments[:-1]:
        child = current.setdefault(segment, {})
        if not isinstance(child, dict):
            raise TransformationError(f'mapped field "{path}" conflicts with another value')
        current = child
    current[segments[-1]] = value


def _formats(rule: Mapping[str, object]) -> list[str] | None:
    value = rule.get("formats", rule.get("format"))
    if value is None:
        return None
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    raise TransformationError("date format must be a string or array of strings")


def apply_transformations(
    mapped_data: Mapping[str, object],
    mappings: Mapping[str, str],
    rules: Sequence[Mapping[str, object]],
) -> tuple[dict[str, object], list[tuple[str, str, object]]]:
    result = copy.deepcopy(dict(mapped_data))
    failures: list[tuple[str, str, object]] = []
    for rule in rules:
        source = str(rule["field"])
        target = mappings[source]
        try:
            original = _get(result, target)
            rule_type = rule["type"]
            if rule_type == "money_parse":
                amount, currency = parse_money(original)
                _set(result, target, format(amount, "f"))
                if currency:
                    _set(result, f"{target.rsplit('.', 1)[0]}.currency", currency)
            elif rule_type == "decimal_to_minor_units":
                _set(result, target, decimal_to_minor_units(original, rule.get("scale", 2)))
            elif rule_type == "currency_convert_explicit":
                rate = _decimal(rule.get("rate"))
                if rate <= 0:
                    raise TransformationError("rate must be greater than zero")
                source_currency = _currency(rule.get("from_currency"), "from_currency")
                target_currency = _currency(rule.get("to_currency"), "to_currency")
                parent = target.rsplit(".", 1)[0]
                current_currency = _get(result, f"{parent}.currency")
                if _currency(current_currency, "mapped currency") != source_currency:
                    raise TransformationError("mapped currency does not match from_currency")
                _set(result, target, format(_decimal(original) * rate, "f"))
                _set(result, f"{parent}.currency", target_currency)
            elif rule_type == "date_parse":
                _set(result, target, parse_date(original, _formats(rule)))
            elif rule_type == "tax_flag":
                _set(result, target, parse_tax_flag(original))
            elif rule_type == "unit_normalize":
                aliases = rule.get("aliases")
                if aliases is not None and not isinstance(aliases, Mapping):
                    raise TransformationError("unit aliases must be a JSON object")
                _set(result, target, normalize_unit(original, aliases))
            elif rule_type == "pack_size_normalize":
                _set(result, target, normalize_pack_size(original))
            else:
                raise TransformationError(f'unsupported transformation "{rule_type}"')
        except (TransformationError, InvalidOperation, TypeError, ValueError) as exc:
            failures.append((target, str(exc), rule.get("type")))
    return result, failures
