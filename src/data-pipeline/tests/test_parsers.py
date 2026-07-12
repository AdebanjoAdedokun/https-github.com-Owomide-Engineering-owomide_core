from __future__ import annotations

import unittest
from datetime import date
from io import BytesIO

from openpyxl import Workbook

from owomide_data_pipeline.errors import ImportLimitError, InvalidImportError
from owomide_data_pipeline.parsers import iter_csv_rows, iter_xlsx_rows


class CsvParserTest(unittest.TestCase):
    def test_streams_utf8_rows_and_preserves_source_line_numbers(self) -> None:
        source = BytesIO(b"SKU,Price\nA-1,100\n\nA-2,250\n")

        rows = list(iter_csv_rows(source, max_rows=10, max_columns=10))

        self.assertEqual([row.row_number for row in rows], [2, 4])
        self.assertEqual(rows[0].raw_data, {"SKU": "A-1", "Price": "100"})

    def test_rejects_duplicate_or_blank_headers(self) -> None:
        for payload in (b"SKU, SKU\nA,B\n", b"SKU,,Price\nA,,1\n"):
            with self.subTest(payload=payload), self.assertRaises(InvalidImportError):
                list(iter_csv_rows(BytesIO(payload), max_rows=10, max_columns=10))

    def test_enforces_row_and_column_limits(self) -> None:
        with self.assertRaises(ImportLimitError):
            list(iter_csv_rows(BytesIO(b"A,B\n1,2\n"), max_rows=10, max_columns=1))
        with self.assertRaises(ImportLimitError):
            list(iter_csv_rows(BytesIO(b"A\n1\n2\n"), max_rows=1, max_columns=10))


class XlsxParserTest(unittest.TestCase):
    def workbook(self) -> BytesIO:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["SKU", "Effective Date", "Formula"])
        sheet.append(["A-1", date(2026, 7, 1), "=1+1"])
        sheet.append([None, None, None])
        sheet.append(["A-2", date(2026, 8, 1), 3])
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        output.seek(0)
        return output

    def test_reads_first_visible_sheet_lazily_and_keeps_formulas(self) -> None:
        rows = list(iter_xlsx_rows(self.workbook(), max_rows=10, max_columns=10))

        self.assertEqual([row.row_number for row in rows], [2, 4])
        self.assertEqual(rows[0].raw_data["Effective Date"], "2026-07-01T00:00:00")
        self.assertEqual(rows[0].raw_data["Formula"], "=1+1")

    def test_rejects_invalid_workbook(self) -> None:
        with self.assertRaises(InvalidImportError):
            list(iter_xlsx_rows(BytesIO(b"not-a-workbook"), max_rows=10, max_columns=10))


if __name__ == "__main__":
    unittest.main()
