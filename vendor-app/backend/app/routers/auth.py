from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    CurrentUser,
    clear_session_cookie,
    create_access_token,
    set_session_cookie,
    verify_password,
)
from app.db import get_db
from app.models import User
from app.ratelimit import limiter
from app.schemas import LoginRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = db.scalar(select(User).where(func.lower(User.username) == body.username.lower()))
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )
    set_session_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
