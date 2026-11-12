import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.auth import create_access_token
from app.config import get_settings
from tests.conftest import TEST_PASSWORD

COOKIE = get_settings().cookie_name


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_correct_login_sets_secure_httponly_cookie(client, user):
    r = client.post("/api/auth/login", json={"username": "alice", "password": TEST_PASSWORD})

    assert r.status_code == 200
    assert r.json()["username"] == "alice"
    assert "password_hash" not in r.json()

    set_cookie = r.headers["set-cookie"]
    assert set_cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert client.cookies.get(COOKIE)


def test_login_username_is_case_insensitive(client, user):
    r = client.post("/api/auth/login", json={"username": "ALICE", "password": TEST_PASSWORD})
    assert r.status_code == 200


def test_wrong_password_returns_401_without_cookie(client, user):
    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401
    assert "set-cookie" not in r.headers


def test_unknown_user_returns_same_401(client, user):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid username or password"


def test_login_validation_error_returns_422(client):
    assert client.post("/api/auth/login", json={"username": "alice"}).status_code == 422


def test_me_returns_current_user(logged_in):
    r = logged_in.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "alice"


def test_protected_route_without_cookie_returns_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_tampered_token_returns_401(client, user):
    token = jwt.encode({"sub": str(user.id), "exp": 9999999999}, "x" * 32, algorithm="HS256")
    client.cookies.set(COOKIE, token, domain="testserver")
    assert client.get("/api/auth/me").status_code == 401


def test_expired_token_returns_401(client, user):
    s = get_settings()
    past = datetime.now(UTC) - timedelta(minutes=1)
    token = jwt.encode({"sub": str(user.id), "exp": past}, s.jwt_secret, algorithm="HS256")
    client.cookies.set(COOKIE, token, domain="testserver")
    assert client.get("/api/auth/me").status_code == 401


def test_token_for_deleted_user_returns_401(client):
    client.cookies.set(COOKIE, create_access_token(uuid.uuid4()), domain="testserver")
    assert client.get("/api/auth/me").status_code == 401


def test_logout_clears_cookie(logged_in):
    r = logged_in.post("/api/auth/logout")
    assert r.status_code == 204
    assert f'{COOKIE}=""' in r.headers["set-cookie"]
    assert logged_in.get("/api/auth/me").status_code == 401


def test_login_rate_limited_after_5_attempts(client, user):
    for _ in range(5):
        r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "alice", "password": TEST_PASSWORD})
    assert r.status_code == 429


def test_mutating_request_without_xhr_header_is_rejected(client, user):
    del client.headers["X-Requested-With"]
    r = client.post("/api/auth/login", json={"username": "alice", "password": TEST_PASSWORD})
    assert r.status_code == 403
    assert "set-cookie" not in r.headers


def test_cors_allows_only_configured_origin(client):
    preflight = {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-requested-with",
    }
    ok = client.options("/api/auth/login", headers={"Origin": "https://frontend.test", **preflight})
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "https://frontend.test"
    assert ok.headers["access-control-allow-credentials"] == "true"

    bad = client.options("/api/auth/login", headers={"Origin": "https://evil.test", **preflight})
    assert "access-control-allow-origin" not in bad.headers
