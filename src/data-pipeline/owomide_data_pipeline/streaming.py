from __future__ import annotations

import hashlib
from collections.abc import Iterable, Iterator
from io import RawIOBase

from owomide_data_pipeline.errors import UploadTooLargeError


class LimitedHashingReader(RawIOBase):
    """Adapts byte chunks to a bounded file-like stream while computing SHA-256."""

    def __init__(self, chunks: Iterable[bytes], max_bytes: int) -> None:
        self._chunks: Iterator[bytes] = iter(chunks)
        self._max_bytes = max_bytes
        self._buffer = bytearray()
        self._digest = hashlib.sha256()
        self._size = 0
        self._eof = False

    @property
    def size(self) -> int:
        return self._size

    @property
    def sha256(self) -> str:
        return self._digest.hexdigest()

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        if size == 0:
            return b""
        if size < 0:
            while not self._eof:
                self._read_next_chunk()
            data = bytes(self._buffer)
            self._buffer.clear()
            return data

        while len(self._buffer) < size and not self._eof:
            self._read_next_chunk()
        data = bytes(self._buffer[:size])
        del self._buffer[:size]
        return data

    def _read_next_chunk(self) -> None:
        while True:
            try:
                chunk = next(self._chunks)
            except StopIteration:
                self._eof = True
                return
            if not isinstance(chunk, bytes):
                raise TypeError("Upload chunks must be bytes")
            if not chunk:
                continue
            next_size = self._size + len(chunk)
            if next_size > self._max_bytes:
                raise UploadTooLargeError(
                    f"Upload exceeds the configured limit of {self._max_bytes} bytes"
                )
            self._size = next_size
            self._digest.update(chunk)
            self._buffer.extend(chunk)
            return
