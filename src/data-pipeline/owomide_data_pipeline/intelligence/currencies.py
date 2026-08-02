from __future__ import annotations

import re

from owomide_data_pipeline.profiler import CURRENCY_CODES

_ZERO_DECIMAL = frozenset(
    {
        "BIF",
        "CLP",
        "DJF",
        "GNF",
        "ISK",
        "JPY",
        "KMF",
        "KRW",
        "PYG",
        "RWF",
        "UGX",
        "UYI",
        "VND",
        "VUV",
        "XAF",
        "XOF",
        "XPF",
    }
)
_THREE_DECIMAL = frozenset({"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"})
_FOUR_DECIMAL = frozenset({"CLF", "UYW"})
_NO_MINOR_UNIT = frozenset(
    {
        "XAG",
        "XAU",
        "XBA",
        "XBB",
        "XBC",
        "XBD",
        "XDR",
        "XPD",
        "XPT",
        "XSU",
        "XUA",
    }
)


def currency_code(value: object, field: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z]{3}", value.strip()):
        raise ValueError(f"{field} must be a three-letter ISO 4217 currency code")
    normalized = value.strip().upper()
    if normalized not in CURRENCY_CODES:
        raise ValueError(f'{field} currency "{normalized}" is not supported')
    return normalized


def currency_minor_unit(code: str) -> int:
    normalized = currency_code(code, "currency")
    if normalized in _NO_MINOR_UNIT:
        raise ValueError(f'currency "{normalized}" has no ISO 4217 minor unit')
    if normalized in _ZERO_DECIMAL:
        return 0
    if normalized in _THREE_DECIMAL:
        return 3
    if normalized in _FOUR_DECIMAL:
        return 4
    return 2
