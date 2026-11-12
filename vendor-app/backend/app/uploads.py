"""Validation of uploaded agreement files: size, extension and magic bytes."""

import io
import re
import unicodedata
import zipfile
from pathlib import PurePosixPath, PureWindowsPath

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}
ALLOWED_EXTENSIONS_TEXT = "PDF, DOCX, PNG or JPG"

_CHUNK = 1024 * 1024


def _matches_magic(ext: str, data: bytes) -> bool:
    if ext == ".pdf":
        return data.startswith(b"%PDF-")
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".docx":
        if not data.startswith(b"PK\x03\x04"):
            return False
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                return "word/document.xml" in zf.namelist()
        except zipfile.BadZipFile:
            return False
    return False


def safe_filename(name: str) -> str:
    """Original filename for display/download only: basename, no control chars, bounded."""
    name = PureWindowsPath(PurePosixPath(name).name).name
    name = "".join(c for c in name if unicodedata.category(c)[0] != "C")
    name = re.sub(r"\s+", " ", name).strip()
    if len(name) > 255:
        stem, dot, ext = name.rpartition(".")
        name = f"{stem[: 255 - len(ext) - 1]}.{ext}" if dot and len(ext) <= 10 else name[:255]
    return name or "attachment"


def _invalid(msg: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=[{"loc": ["body", "file"], "msg": msg, "type": "value_error"}],
    )


async def read_validated_upload(file: UploadFile) -> tuple[bytes, str]:
    """Return (content, safe original filename), or raise 413/422."""
    max_bytes = get_settings().max_upload_bytes
    filename = safe_filename(file.filename or "")
    ext = PurePosixPath(filename).suffix.lower()
    if ext not in MEDIA_TYPES:
        raise _invalid(f"File must be {ALLOWED_EXTENSIONS_TEXT}")

    buf = bytearray()
    while chunk := await file.read(_CHUNK):
        buf += chunk
        if len(buf) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds the {max_bytes // (1024 * 1024)} MB limit",
            )
    data = bytes(buf)
    if not data:
        raise _invalid("File is empty")
    if not _matches_magic(ext, data):
        raise _invalid(f"File content does not match a {ext[1:].upper()} file")
    return data, filename


def media_type_for(filename: str) -> str:
    return MEDIA_TYPES.get(PurePosixPath(filename).suffix.lower(), "application/octet-stream")
