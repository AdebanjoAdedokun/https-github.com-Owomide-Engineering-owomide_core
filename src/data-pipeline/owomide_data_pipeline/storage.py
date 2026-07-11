from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import BinaryIO
from urllib.parse import urlsplit

from minio import Minio
from minio.error import S3Error


@dataclass(frozen=True, slots=True)
class StoredObject:
    url: str
    etag: str


class ObjectStore:
    def __init__(
        self,
        *,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool,
        bucket: str,
    ) -> None:
        self._client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self._bucket = bucket

    @property
    def bucket(self) -> str:
        return self._bucket

    def ensure_bucket(self) -> None:
        if self._client.bucket_exists(self._bucket):
            return
        try:
            self._client.make_bucket(self._bucket)
        except S3Error as exc:
            if exc.code not in {"BucketAlreadyExists", "BucketAlreadyOwnedByYou"}:
                raise

    def ready(self) -> bool:
        try:
            self.ensure_bucket()
            return True
        except (OSError, S3Error):
            return False

    def put_stream(self, object_name: str, stream: BinaryIO, content_type: str) -> StoredObject:
        self.ensure_bucket()
        result = self._client.put_object(
            self._bucket,
            object_name,
            stream,
            length=-1,
            part_size=5 * 1024 * 1024,
            content_type=content_type,
        )
        return StoredObject(
            url=f"s3://{self._bucket}/{object_name}",
            etag=result.etag,
        )

    def delete(self, object_url: str) -> None:
        bucket, object_name = self._parse_url(object_url)
        self._client.remove_object(bucket, object_name)

    @contextmanager
    def open(self, object_url: str) -> Iterator[BinaryIO]:
        bucket, object_name = self._parse_url(object_url)
        response = self._client.get_object(bucket, object_name)
        response.auto_close = False
        try:
            yield response
        finally:
            response.close()
            response.release_conn()

    def _parse_url(self, object_url: str) -> tuple[str, str]:
        parsed = urlsplit(object_url)
        object_name = parsed.path.lstrip("/")
        if parsed.scheme != "s3" or parsed.netloc != self._bucket or not object_name:
            raise ValueError("Object URL does not belong to the configured import bucket")
        return parsed.netloc, object_name
