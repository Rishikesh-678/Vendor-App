"""Attachment storage behind a small interface, so LocalStorage can be swapped for GCS/S3."""

import os
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Protocol

from app.config import get_settings

_KEY_RE = re.compile(r"^[0-9a-f]{32}$")


class Storage(Protocol):
    def save(self, data: bytes) -> str:
        """Store bytes under a newly generated key and return the key."""

    def open(self, key: str) -> BinaryIO:
        """Open a stored object for reading. Raises FileNotFoundError if missing."""

    def delete(self, key: str) -> None:
        """Delete a stored object. Missing objects are ignored."""


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Keys are always ones we generated; reject anything else (no path traversal).
        if not _KEY_RE.fullmatch(key):
            raise ValueError("invalid storage key")
        return self.root / key

    def save(self, data: bytes) -> str:
        key = uuid.uuid4().hex
        path = self._path(key)
        tmp = path.with_suffix(".tmp")
        with open(tmp, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(path)
        return key

    def open(self, key: str) -> BinaryIO:
        return open(self._path(key), "rb")

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


@lru_cache
def get_storage() -> Storage:
    return LocalStorage(get_settings().attachments_dir)
