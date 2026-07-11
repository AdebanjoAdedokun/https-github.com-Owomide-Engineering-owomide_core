from __future__ import annotations

import csv
import math
from collections.abc import Iterator
from contextlib import suppress
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from io import TextIOWrapper
from typing import BinaryIO
from zipfile import BadZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from owomide_data_pipeline.errors import ImportLimitError, InvalidImportError


@dataclass(frozen=True, slots=True)
class ParsedRow:
    row_number: int
    raw_data: dict[str, object]


def _headers(values: list[object], max_columns: int) -> list[str]:
    if len(values) > max_columns:
        raise ImportLimitError(f"Import exceeds the configured limit of {max_columns} columns")
    headers = ["" if value is None else str(value).strip() for value in values]
    while headers and not headers[-1]:
        headers.pop()
    if not headers:
        raise InvalidImportError("Import file does not contain a header row")
    if any(not header for header in headers):
        raise InvalidImportError("Import header contains a blank column name")
    if len(set(headers)) != len(headers):
        raise InvalidImportError("Import header contains duplicate column names")
    return headers


def iter_csv_rows(
    stream: BinaryIO,
    *,
    max_rows: int,
    max_columns: int,
) -> Iterator[ParsedRow]:
    text = TextIOWrapper(stream, encoding="utf-8-sig", errors="strict", newline="")
    try:
        reader = csv.reader(text)
        try:
            header_values = next(reader)
        except StopIteration as exc:
            raise InvalidImportError("CSV file is empty") from exc
        headers = _headers(list(header_values), max_columns)
        emitted = 0
        for values in reader:
            if len(values) > len(headers) and any(value != "" for value in values[len(headers) :]):
                raise InvalidImportError(f"CSV row {reader.line_num} has more values than headers")
            padded = values[: len(headers)] + [""] * max(0, len(headers) - len(values))
            if not any(value != "" for value in padded):
                continue
            emitted += 1
            if emitted > max_rows:
                raise ImportLimitError(
                    f"Import exceeds the configured limit of {max_rows} data rows"
                )
            yield ParsedRow(
                row_number=reader.line_num,
                raw_data=dict(zip(headers, padded, strict=True)),
            )
    except UnicodeDecodeError as exc:
        raise InvalidImportError("CSV file must be UTF-8 encoded") from exc
    except csv.Error as exc:
        raise InvalidImportError(f"CSV parsing failed: {exc}") from exc
    finally:
        with suppress(ValueError):
            text.detach()


def _json_value(value: object) -> object:
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return str(value)


def iter_xlsx_rows(
    stream: BinaryIO,
    *,
    max_rows: int,
    max_columns: int,
) -> Iterator[ParsedRow]:
    try:
        workbook = load_workbook(stream, read_only=True, data_only=False, keep_links=False)
    except (BadZipFile, InvalidFileException, OSError, ValueError) as exc:
        raise InvalidImportError("XLSX file is not a valid workbook") from exc
    try:
        worksheet = next(
            (sheet for sheet in workbook.worksheets if sheet.sheet_state == "visible"),
            None,
        )
        if worksheet is None:
            raise InvalidImportError("XLSX workbook has no visible worksheet")
        rows = worksheet.iter_rows(values_only=True)
        try:
            header_values = list(next(rows))
        except StopIteration as exc:
            raise InvalidImportError("XLSX worksheet is empty") from exc
        headers = _headers(header_values, max_columns)
        emitted = 0
        for row_number, values_tuple in enumerate(rows, start=2):
            values = list(values_tuple)
            if len(values) > len(headers) and any(
                value is not None for value in values[len(headers) :]
            ):
                raise InvalidImportError(f"XLSX row {row_number} has more values than headers")
            padded = values[: len(headers)] + [None] * max(0, len(headers) - len(values))
            if not any(value is not None and value != "" for value in padded):
                continue
            emitted += 1
            if emitted > max_rows:
                raise ImportLimitError(
                    f"Import exceeds the configured limit of {max_rows} data rows"
                )
            yield ParsedRow(
                row_number=row_number,
                raw_data={
                    header: _json_value(value)
                    for header, value in zip(headers, padded, strict=True)
                },
            )
    finally:
        workbook.close()
