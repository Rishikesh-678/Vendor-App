"""Test setup: runs against a separate `<db>_test` database, migrated with Alembic.

Must configure the environment before any `app` module is imported.
"""

import os
import tempfile

from sqlalchemy import create_engine, make_url, text

_main_url = make_url(os.environ["DATABASE_URL"])
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or _main_url.set(
    database=f"{_main_url.database}_test"
).render_as_string(hide_password=False)

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["COOKIE_SECURE"] = "true"
os.environ["CORS_ORIGINS"] = "https://frontend.test"
os.environ["ATTACHMENTS_DIR"] = tempfile.mkdtemp(prefix="vendor-attachments-")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

TEST_PASSWORD = "correct-horse-battery"


def _ensure_test_database() -> None:
    test_db = make_url(TEST_DATABASE_URL).database
    admin_engine = create_engine(_main_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": test_db})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{test_db}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _database():
    _ensure_test_database()
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def _clean_state():
    yield
    with get_sessionmaker()() as db:
        db.execute(text("TRUNCATE vendors, users CASCADE"))
        db.commit()
    limiter.reset()


@pytest.fixture
def db():
    with get_sessionmaker()() as session:
        yield session


@pytest.fixture
def user(db) -> User:
    u = User(username="alice", password_hash=hash_password(TEST_PASSWORD))
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def client() -> TestClient:
    # https base URL so the client honours the cookie's Secure flag like a browser would.
    c = TestClient(app, base_url="https://testserver")
    c.headers["X-Requested-With"] = "XMLHttpRequest"
    return c


@pytest.fixture
def logged_in(client, user) -> TestClient:
    r = client.post("/api/auth/login", json={"username": "alice", "password": TEST_PASSWORD})
    assert r.status_code == 200
    return client
