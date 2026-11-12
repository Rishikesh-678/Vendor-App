# Vendor Management Web App — Build Plan

> Hand this file to Claude Code. Suggested prompt:
> "Read VENDOR_APP_PLAN.md and build the app phase by phase. After each phase, run it, verify the acceptance criteria, and stop for my review before continuing."

## 1. Goal

An internal web app where logged-in users can view, add, edit and remove vendors. Each vendor has:

| Field | Type | Rules |
|---|---|---|
| Vendor Name | text | required, max 200 chars, unique (case-insensitive) |
| Start Date | date | required |
| Renewal Date | date | required, must be on/after Start Date |
| Agreement Attachment | file | optional; PDF/DOCX/PNG/JPG only; max 10 MB |
| Cost | decimal(12,2) + currency | required, ≥ 0; currency default INR |
| Nature of Service | text | required; free text with suggestions (e.g. SaaS, Cloud, Hardware, Consulting, Support/AMC, Other) |

## 2. Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2
- **Database:** PostgreSQL 16
- **Auth:** username/password, passwords hashed with bcrypt (passlib), JWT in an **httpOnly, Secure, SameSite=Lax cookie** (not localStorage)
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query
- **File storage:** local volume `/data/attachments` behind a storage interface (so it can be swapped to GCS/S3 later)
- **Run:** Docker Compose (`db`, `backend`, `frontend`); nginx serves the built frontend and proxies `/api`

## 3. Project structure

```
vendor-app/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py          # pydantic-settings, reads env
│   │   ├── db.py
│   │   ├── models.py          # User, Vendor
│   │   ├── schemas.py
│   │   ├── auth.py            # hashing, JWT, get_current_user dependency
│   │   ├── storage.py         # LocalStorage (interface for GCS/S3 later)
│   │   ├── routers/{auth.py, vendors.py}
│   │   └── cli.py             # create-admin command
│   └── tests/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── api/               # fetch wrapper (credentials: 'include')
        ├── pages/{Login.tsx, Vendors.tsx}
        ├── components/{VendorTable.tsx, VendorForm.tsx, ConfirmDialog.tsx}
        └── auth/              # AuthContext + ProtectedRoute
```

## 4. Data model

**users**: id (uuid), username (unique), password_hash, is_admin (bool), created_at

**vendors**: id (uuid), name, start_date, renewal_date, cost (numeric 12,2), currency (char 3), nature_of_service, attachment_path (nullable), attachment_filename (nullable, original name), created_by (fk users), created_at, updated_at, deleted_at (nullable — **soft delete**)

- Unique index on `lower(name)` where `deleted_at is null`
- Check constraint `renewal_date >= start_date`

## 5. API

| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/login | body {username, password}; sets cookie |
| POST | /api/auth/logout | clears cookie |
| GET | /api/auth/me | current user |
| GET | /api/vendors | list (excludes deleted); query: `search`, `sort`, `order`, `page`, `page_size` |
| POST | /api/vendors | multipart/form-data (fields + optional file) |
| GET | /api/vendors/{id} | single vendor |
| PUT | /api/vendors/{id} | multipart; can replace or remove attachment |
| DELETE | /api/vendors/{id} | soft delete |
| GET | /api/vendors/{id}/attachment | streams file with original filename; auth required |

All `/api/vendors*` routes require login. Return 401 when not authenticated, 422 on validation errors.

## 6. Security requirements

- Validate uploads by extension **and** magic bytes; store under a generated UUID filename, never the user-supplied name
- Attachments are never served as static files — only via the authenticated endpoint
- Rate-limit `/api/auth/login` (e.g. 5 attempts/min per IP) — use `slowapi`
- CSRF: SameSite=Lax cookie + require `X-Requested-With` header on mutating requests
- No default credentials; first admin created via `python -m app.cli create-admin`
- Secrets (`JWT_SECRET`, `DATABASE_URL`) from env only; provide `.env.example`
- CORS locked to the frontend origin

## 7. UI

**Login page:** username, password, submit, error message on failure. Redirect to `/vendors` on success.

**Vendors page (protected):**

- Header with app name, logged-in username, Logout button
- Table columns: Vendor Name · Start Date · Renewal Date · Agreement (download link or "—") · Cost (formatted, e.g. ₹1,20,000.00) · Nature of Service · Actions (Edit, Delete)
- Search box (by name / nature of service), sortable columns, pagination
- Highlight rows where renewal date is within 30 days (amber) or past (red)
- "Add Vendor" button opens a modal form; same form for Edit
- Delete asks for confirmation in a modal
- Toasts for success/error; loading and empty states
- Dates shown as DD-MMM-YYYY

## 8. Build phases

**Phase 1 — Backend foundation**
Docker Compose with Postgres, FastAPI skeleton, config, models, Alembic migration, create-admin CLI.
✅ `docker compose up` starts; `/api/health` returns 200; admin can be created.

**Phase 2 — Auth**
Login/logout/me, JWT cookie, `get_current_user`, login rate limit.
✅ Tests: correct login sets cookie; wrong password → 401; protected route without cookie → 401.

**Phase 3 — Vendor CRUD + attachments**
All vendor endpoints, validation, soft delete, file upload/download.
✅ Tests: create/list/update/delete; renewal < start → 422; bad file type → 422; oversized file → 413; download requires auth.

**Phase 4 — Frontend**
Login page, protected routing, vendor table, add/edit modal, delete confirm, search/sort/pagination, renewal highlighting.
✅ Manually: log in, add a vendor with a PDF, edit it, download the PDF, delete it, log out.

**Phase 5 — Polish & docs**
README (setup, env vars, create-admin, backup of DB + attachments volume), lint (ruff, eslint), production nginx config.
✅ Fresh clone → follow README → working app.

## 9. Out of scope for v1 (possible later)

- Microsoft Entra ID (Azure AD) SSO instead of local passwords
- Role-based access (viewer vs editor)
- Email reminders before renewal dates (daily cron)
- Audit log of who changed what
- Export to Excel/CSV
- Attachments on GCS/S3

## 10. Instructions for Claude Code

- Work one phase at a time; stop after each phase and summarise what was built and how to verify it.
- Write tests alongside backend code (pytest + httpx TestClient, separate test DB).
- Don't add features beyond this plan without asking.
- Ask before changing the stack or data model.
