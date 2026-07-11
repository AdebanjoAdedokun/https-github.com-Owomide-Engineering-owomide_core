from __future__ import annotations

import hashlib
import unittest

from owomide_data_pipeline.errors import UploadTooLargeError
from owomide_data_pipeline.streaming import LimitedHashingReader


class LimitedHashingReaderTest(unittest.TestCase):
    def test_reads_across_chunks_and_computes_exact_digest(self) -> None:
        reader = LimitedHashingReader([b"ab", b"", b"cdef"], max_bytes=10)

        self.assertEqual(reader.read(3), b"abc")
        self.assertEqual(reader.read(2), b"de")
        self.assertEqual(reader.read(), b"f")
        self.assertEqual(reader.size, 6)
        self.assertEqual(reader.sha256, hashlib.sha256(b"abcdef").hexdigest())

    def test_stops_before_accepting_a_chunk_over_the_limit(self) -> None:
        reader = LimitedHashingReader([b"abc", b"def"], max_bytes=5)

        self.assertEqual(reader.read(3), b"abc")
        with self.assertRaises(UploadTooLargeError):
            reader.read(3)
        self.assertEqual(reader.size, 3)


if __name__ == "__main__":
    unittest.main()
