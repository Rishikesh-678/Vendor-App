import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Currency = Annotated[
    str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$")
]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    is_admin: bool


class VendorForm(BaseModel):
    """Multipart form fields for creating a vendor (the file is a separate part)."""

    name: Name
    start_date: date
    renewal_date: date
    cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    currency: Currency = "INR"
    nature_of_service: Name

    @model_validator(mode="after")
    def renewal_not_before_start(self) -> "VendorForm":
        if self.renewal_date < self.start_date:
            raise ValueError("Renewal date must be on or after the start date")
        return self


class VendorUpdateForm(VendorForm):
    remove_attachment: bool = False


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    start_date: date
    renewal_date: date
    cost: Decimal
    currency: str
    nature_of_service: str
    attachment_filename: str | None
    created_at: datetime
    updated_at: datetime


class VendorPage(BaseModel):
    items: list[VendorOut]
    total: int
    page: int
    page_size: int
