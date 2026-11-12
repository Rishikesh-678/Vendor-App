import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.models import Vendor
from app.schemas import VendorForm, VendorOut, VendorPage, VendorUpdateForm
from app.storage import Storage, get_storage
from app.uploads import media_type_for, read_validated_upload

router = APIRouter(
    prefix="/api/vendors", tags=["vendors"], dependencies=[Depends(get_current_user)]
)

DB = Annotated[Session, Depends(get_db)]
Store = Annotated[Storage, Depends(get_storage)]
OptionalFile = Annotated[UploadFile | None, File()]


def _validate_form[M: BaseModel](model: type[M], fields: dict) -> M:
    try:
        return model.model_validate(fields)
    except ValidationError as exc:
        errors = exc.errors(include_url=False, include_context=False)
        raise RequestValidationError([{**e, "loc": ("body", *e["loc"])} for e in errors]) from None


# Form fields are declared explicitly (rather than as a Form() model) because FastAPI
# doesn't flatten a Pydantic form model when a File() parameter sits alongside it.
def vendor_form(
    name: Annotated[str, Form()],
    start_date: Annotated[str, Form()],
    renewal_date: Annotated[str, Form()],
    cost: Annotated[str, Form()],
    nature_of_service: Annotated[str, Form()],
    currency: Annotated[str, Form()] = "INR",
) -> VendorForm:
    return _validate_form(VendorForm, locals())


def vendor_update_form(
    name: Annotated[str, Form()],
    start_date: Annotated[str, Form()],
    renewal_date: Annotated[str, Form()],
    cost: Annotated[str, Form()],
    nature_of_service: Annotated[str, Form()],
    currency: Annotated[str, Form()] = "INR",
    remove_attachment: Annotated[bool, Form()] = False,
) -> VendorUpdateForm:
    return _validate_form(VendorUpdateForm, locals())


class SortField(StrEnum):
    name = "name"
    start_date = "start_date"
    renewal_date = "renewal_date"
    cost = "cost"
    nature_of_service = "nature_of_service"
    created_at = "created_at"


class SortOrder(StrEnum):
    asc = "asc"
    desc = "desc"


_SORT_COLUMNS = {
    SortField.name: func.lower(Vendor.name),
    SortField.start_date: Vendor.start_date,
    SortField.renewal_date: Vendor.renewal_date,
    SortField.cost: Vendor.cost,
    SortField.nature_of_service: func.lower(Vendor.nature_of_service),
    SortField.created_at: Vendor.created_at,
}


def _get_active(db: Session, vendor_id: uuid.UUID) -> Vendor:
    vendor = db.scalar(select(Vendor).where(Vendor.id == vendor_id, Vendor.deleted_at.is_(None)))
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


def _ensure_unique_name(db: Session, name: str, exclude_id: uuid.UUID | None = None) -> None:
    q = select(Vendor.id).where(
        func.lower(Vendor.name) == name.lower(), Vendor.deleted_at.is_(None)
    )
    if exclude_id is not None:
        q = q.where(Vendor.id != exclude_id)
    if db.scalar(q) is not None:
        raise _duplicate_name()


def _duplicate_name() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail="A vendor with this name already exists"
    )


def _uploaded(file: UploadFile | None) -> UploadFile | None:
    # Browsers send an empty, unnamed part when no file is chosen.
    return file if file is not None and file.filename else None


def _commit(db: Session, storage: Storage, new_key: str | None) -> None:
    """Commit, rolling back and removing a just-saved file if the commit fails."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if new_key:
            storage.delete(new_key)
        if "uq_vendors_lower_name_active" in str(exc.orig):
            raise _duplicate_name() from None
        raise
    except Exception:
        db.rollback()
        if new_key:
            storage.delete(new_key)
        raise


@router.get("", response_model=VendorPage)
def list_vendors(
    db: DB,
    search: Annotated[str | None, Query(max_length=200)] = None,
    sort: SortField = SortField.name,
    order: SortOrder = SortOrder.asc,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> VendorPage:
    q = select(Vendor).where(Vendor.deleted_at.is_(None))
    if search and search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        pattern = f"%{escaped}%"
        q = q.where(
            or_(
                Vendor.name.ilike(pattern, escape="\\"),
                Vendor.nature_of_service.ilike(pattern, escape="\\"),
            )
        )

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    col = _SORT_COLUMNS[sort]
    q = q.order_by(col.asc() if order is SortOrder.asc else col.desc(), Vendor.id)
    items = db.scalars(q.offset((page - 1) * page_size).limit(page_size)).all()
    return VendorPage(
        items=[VendorOut.model_validate(v) for v in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    user: CurrentUser,
    data: Annotated[VendorForm, Depends(vendor_form)],
    db: DB,
    storage: Store,
    file: OptionalFile = None,
) -> Vendor:
    _ensure_unique_name(db, data.name)
    vendor = Vendor(**data.model_dump(), created_by=user.id)

    new_key = None
    if upload := _uploaded(file):
        content, filename = await read_validated_upload(upload)
        new_key = storage.save(content)
        vendor.attachment_path, vendor.attachment_filename = new_key, filename

    db.add(vendor)
    _commit(db, storage, new_key)
    db.refresh(vendor)
    return vendor


@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(vendor_id: uuid.UUID, db: DB) -> Vendor:
    return _get_active(db, vendor_id)


@router.put("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: uuid.UUID,
    data: Annotated[VendorUpdateForm, Depends(vendor_update_form)],
    db: DB,
    storage: Store,
    file: OptionalFile = None,
) -> Vendor:
    vendor = _get_active(db, vendor_id)
    _ensure_unique_name(db, data.name, exclude_id=vendor.id)

    upload = _uploaded(file)
    if upload and data.remove_attachment:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Send either a new file or remove_attachment, not both",
        )

    for field, value in data.model_dump(exclude={"remove_attachment"}).items():
        setattr(vendor, field, value)

    old_key, new_key = vendor.attachment_path, None
    if upload:
        content, filename = await read_validated_upload(upload)
        new_key = storage.save(content)
        vendor.attachment_path, vendor.attachment_filename = new_key, filename
    elif data.remove_attachment:
        vendor.attachment_path = vendor.attachment_filename = None

    _commit(db, storage, new_key)
    if old_key and old_key != vendor.attachment_path:
        storage.delete(old_key)
    db.refresh(vendor)
    return vendor


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(vendor_id: uuid.UUID, db: DB) -> None:
    vendor = _get_active(db, vendor_id)
    # Soft delete: the row and its attachment are kept so the vendor can be restored.
    vendor.deleted_at = datetime.now(UTC)
    db.commit()


@router.get("/{vendor_id}/attachment")
def download_attachment(vendor_id: uuid.UUID, db: DB, storage: Store) -> StreamingResponse:
    vendor = _get_active(db, vendor_id)
    if not vendor.attachment_path or not vendor.attachment_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No attachment")
    try:
        stream = storage.open(vendor.attachment_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file missing"
        ) from None

    filename = vendor.attachment_filename
    ascii_fallback = filename.encode("ascii", "replace").decode().replace('"', "").replace("?", "_")
    disposition = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"

    def iterfile():
        with stream:
            while chunk := stream.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type=media_type_for(filename),
        headers={
            "Content-Disposition": disposition,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
