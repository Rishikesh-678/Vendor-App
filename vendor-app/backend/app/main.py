from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.ratelimit import limiter
from app.routers import auth, vendors

settings = get_settings()

app = FastAPI(title="Vendor Management", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def require_xhr_header(request: Request, call_next):
    """CSRF defence alongside SameSite=Lax: a cross-site page can't send a custom header
    without a CORS preflight, which only the configured frontend origin passes."""
    if request.method not in SAFE_METHODS and not request.headers.get("x-requested-with"):
        return JSONResponse(status_code=403, content={"detail": "Missing X-Requested-With header"})
    return await call_next(request)


# Allowance for the non-file form fields and multipart framing on top of the file limit.
_FORM_OVERHEAD_BYTES = 1024 * 1024


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Reject oversized bodies before they are parsed/spooled. The exact per-file limit
    is enforced in app.uploads; this only stops grossly oversized requests early."""
    length = request.headers.get("content-length")
    if length and length.isdigit():
        if int(length) > settings.max_upload_bytes + _FORM_OVERHEAD_BYTES:
            return JSONResponse(status_code=413, content={"detail": "Request too large"})
    return await call_next(request)


# Added last so it is outermost: preflight requests are answered before the CSRF check.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

app.include_router(auth.router)
app.include_router(vendors.router)


@app.get("/api/health")
def health(db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}
