import io
import zipfile

import pytest
from sqlalchemy import select

from app.models import Vendor
from app.storage import get_storage

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def make_docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("word/document.xml", "<w:document/>")
    return buf.getvalue()


def vendor_data(**overrides) -> dict:
    data = {
        "name": "Acme Cloud",
        "start_date": "2026-01-01",
        "renewal_date": "2027-01-01",
        "cost": "120000.00",
        "currency": "INR",
        "nature_of_service": "Cloud",
    }
    data.update(overrides)
    return data


def create(client, file=None, **overrides):
    files = {"file": file} if file else None
    return client.post("/api/vendors", data=vendor_data(**overrides), files=files)


# --- auth -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/vendors"),
        ("post", "/api/vendors"),
        ("get", "/api/vendors/00000000-0000-0000-0000-000000000000"),
        ("put", "/api/vendors/00000000-0000-0000-0000-000000000000"),
        ("delete", "/api/vendors/00000000-0000-0000-0000-000000000000"),
        ("get", "/api/vendors/00000000-0000-0000-0000-000000000000/attachment"),
    ],
)
def test_vendor_routes_require_login(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_download_requires_auth(logged_in):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    logged_in.post("/api/auth/logout")
    logged_in.cookies.clear()
    assert logged_in.get(f"/api/vendors/{vid}/attachment").status_code == 401


# --- create / read ----------------------------------------------------------


def test_create_and_get(logged_in):
    r = create(logged_in, name="  Acme Cloud  ", currency="usd")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Acme Cloud"
    assert body["currency"] == "USD"
    assert body["cost"] == "120000.00"
    assert body["attachment_filename"] is None
    assert "attachment_path" not in body

    got = logged_in.get(f"/api/vendors/{body['id']}")
    assert got.status_code == 200
    assert got.json() == body


def test_currency_defaults_to_inr(logged_in):
    data = vendor_data()
    del data["currency"]
    assert logged_in.post("/api/vendors", data=data).json()["currency"] == "INR"


def test_renewal_before_start_returns_422(logged_in):
    r = create(logged_in, start_date="2026-06-01", renewal_date="2026-05-31")
    assert r.status_code == 422
    assert "Renewal date" in r.text


def test_renewal_equal_to_start_is_allowed(logged_in):
    assert create(logged_in, start_date="2026-06-01", renewal_date="2026-06-01").status_code == 201


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 201},
        {"cost": "-1"},
        {"cost": "1.234"},
        {"cost": "10000000000.00"},
        {"cost": "abc"},
        {"currency": "RUPEE"},
        {"start_date": "not-a-date"},
        {"nature_of_service": ""},
    ],
)
def test_invalid_fields_return_422(logged_in, overrides):
    assert create(logged_in, **overrides).status_code == 422


def test_missing_required_field_returns_422(logged_in):
    data = vendor_data()
    del data["renewal_date"]
    assert logged_in.post("/api/vendors", data=data).status_code == 422


def test_duplicate_name_case_insensitive_returns_409(logged_in):
    assert create(logged_in, name="Acme").status_code == 201
    r = create(logged_in, name="ACME")
    assert r.status_code == 409


def test_unknown_vendor_returns_404(logged_in):
    assert logged_in.get("/api/vendors/00000000-0000-0000-0000-000000000000").status_code == 404


# --- attachments --------------------------------------------------------------


@pytest.mark.parametrize(
    ("filename", "content", "media_type"),
    [
        ("agreement.pdf", PDF, "application/pdf"),
        ("scan.PNG", PNG, "image/png"),
        ("scan.jpg", JPG, "image/jpeg"),
        ("scan.jpeg", JPG, "image/jpeg"),
        (
            "contract.docx",
            make_docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    ],
)
def test_upload_and_download_allowed_types(logged_in, filename, content, media_type):
    r = create(logged_in, file=(filename, content, "application/octet-stream"))
    assert r.status_code == 201, r.text
    assert r.json()["attachment_filename"] == filename

    d = logged_in.get(f"/api/vendors/{r.json()['id']}/attachment")
    assert d.status_code == 200
    assert d.content == content
    assert d.headers["content-type"].startswith(media_type)
    assert f'filename="{filename}"' in d.headers["content-disposition"]
    assert d.headers["x-content-type-options"] == "nosniff"


def test_file_stored_under_generated_name(logged_in, db):
    vid = create(logged_in, file=("../../etc/evil.pdf", PDF, "application/pdf")).json()["id"]
    vendor = db.scalar(select(Vendor).where(Vendor.id == vid))
    assert vendor.attachment_filename == "evil.pdf"
    assert len(vendor.attachment_path) == 32 and "evil" not in vendor.attachment_path
    with get_storage().open(vendor.attachment_path) as f:
        assert f.read() == PDF


def test_non_ascii_filename_download(logged_in):
    vid = create(logged_in, file=("करार.pdf", PDF, "application/pdf")).json()["id"]
    cd = logged_in.get(f"/api/vendors/{vid}/attachment").headers["content-disposition"]
    assert "filename*=UTF-8''%E0%A4%95" in cd


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("malware.exe", b"MZ\x90\x00"),
        ("notes.txt", b"hello"),
        ("noextension", PDF),
        ("fake.pdf", b"MZ\x90\x00 not really a pdf"),
        ("fake.png", PDF),
        ("fake.docx", b"PK\x03\x04 not a zip"),
        ("archive.docx", b"PK\x03\x04"),  # truncated zip
        ("empty.pdf", b""),
    ],
)
def test_bad_file_type_returns_422(logged_in, filename, content):
    r = create(logged_in, file=(filename, content, "application/pdf"))
    assert r.status_code == 422, r.text
    assert logged_in.get("/api/vendors").json()["total"] == 0


def test_plain_zip_renamed_docx_returns_422(logged_in):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hi")
    assert create(logged_in, file=("x.docx", buf.getvalue(), "")).status_code == 422


def test_oversized_file_returns_413(logged_in):
    big = PDF + b"0" * (10 * 1024 * 1024)
    r = create(logged_in, file=("big.pdf", big, "application/pdf"))
    assert r.status_code == 413
    assert logged_in.get("/api/vendors").json()["total"] == 0


def test_file_exactly_at_limit_is_accepted(logged_in):
    exact = PDF + b"0" * (10 * 1024 * 1024 - len(PDF))
    assert create(logged_in, file=("ok.pdf", exact, "application/pdf")).status_code == 201


def test_grossly_oversized_request_rejected_before_parsing(logged_in):
    r = logged_in.post(
        "/api/vendors",
        content=b"x",
        headers={"Content-Type": "multipart/form-data; boundary=x", "Content-Length": "999999999"},
    )
    assert r.status_code == 413


def test_empty_file_part_means_no_attachment(logged_in):
    r = create(logged_in, file=("", b"", "application/octet-stream"))
    assert r.status_code == 201, r.text
    assert r.json()["attachment_filename"] is None


def test_download_without_attachment_returns_404(logged_in):
    vid = create(logged_in).json()["id"]
    assert logged_in.get(f"/api/vendors/{vid}/attachment").status_code == 404


# --- update -------------------------------------------------------------------


def test_update_fields(logged_in):
    vid = create(logged_in).json()["id"]
    r = logged_in.put(f"/api/vendors/{vid}", data=vendor_data(name="Acme Renamed", cost="99.50"))
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Acme Renamed"
    assert r.json()["cost"] == "99.50"
    assert logged_in.get(f"/api/vendors/{vid}").json()["name"] == "Acme Renamed"


def test_update_keeps_attachment_when_no_file_sent(logged_in):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    r = logged_in.put(f"/api/vendors/{vid}", data=vendor_data(cost="1"))
    assert r.json()["attachment_filename"] == "a.pdf"


def test_update_replaces_attachment_and_deletes_old_file(logged_in, db):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    old_key = db.scalar(select(Vendor.attachment_path).where(Vendor.id == vid))

    r = logged_in.put(
        f"/api/vendors/{vid}", data=vendor_data(), files={"file": ("b.png", PNG, "image/png")}
    )
    assert r.status_code == 200, r.text
    assert r.json()["attachment_filename"] == "b.png"
    assert logged_in.get(f"/api/vendors/{vid}/attachment").content == PNG
    with pytest.raises(FileNotFoundError):
        get_storage().open(old_key)


def test_update_removes_attachment(logged_in, db):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    old_key = db.scalar(select(Vendor.attachment_path).where(Vendor.id == vid))

    r = logged_in.put(f"/api/vendors/{vid}", data=vendor_data(remove_attachment="true"))
    assert r.status_code == 200
    assert r.json()["attachment_filename"] is None
    assert logged_in.get(f"/api/vendors/{vid}/attachment").status_code == 404
    with pytest.raises(FileNotFoundError):
        get_storage().open(old_key)


def test_update_with_bad_file_keeps_old_attachment(logged_in):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    r = logged_in.put(
        f"/api/vendors/{vid}",
        data=vendor_data(name="Changed"),
        files={"file": ("x.exe", b"MZ", "application/octet-stream")},
    )
    assert r.status_code == 422
    got = logged_in.get(f"/api/vendors/{vid}").json()
    assert got["name"] == "Acme Cloud"
    assert got["attachment_filename"] == "a.pdf"


def test_update_renewal_before_start_returns_422(logged_in):
    vid = create(logged_in).json()["id"]
    r = logged_in.put(f"/api/vendors/{vid}", data=vendor_data(renewal_date="2025-01-01"))
    assert r.status_code == 422


def test_update_to_duplicate_name_returns_409(logged_in):
    create(logged_in, name="Alpha")
    vid = create(logged_in, name="Beta").json()["id"]
    assert logged_in.put(f"/api/vendors/{vid}", data=vendor_data(name="alpha")).status_code == 409


def test_update_keeping_own_name_is_allowed(logged_in):
    vid = create(logged_in, name="Alpha").json()["id"]
    assert logged_in.put(f"/api/vendors/{vid}", data=vendor_data(name="ALPHA")).status_code == 200


# --- delete -------------------------------------------------------------------


def test_soft_delete(logged_in, db):
    vid = create(logged_in, file=("a.pdf", PDF, "application/pdf")).json()["id"]
    assert logged_in.delete(f"/api/vendors/{vid}").status_code == 204

    assert logged_in.get(f"/api/vendors/{vid}").status_code == 404
    assert logged_in.get(f"/api/vendors/{vid}/attachment").status_code == 404
    assert logged_in.put(f"/api/vendors/{vid}", data=vendor_data()).status_code == 404
    assert logged_in.delete(f"/api/vendors/{vid}").status_code == 404
    assert logged_in.get("/api/vendors").json()["total"] == 0

    row = db.scalar(select(Vendor).where(Vendor.id == vid))
    assert row is not None and row.deleted_at is not None
    with get_storage().open(row.attachment_path) as f:  # kept for possible restore
        assert f.read() == PDF


def test_name_reusable_after_delete(logged_in):
    vid = create(logged_in, name="Acme").json()["id"]
    logged_in.delete(f"/api/vendors/{vid}")
    assert create(logged_in, name="acme").status_code == 201


# --- list: search / sort / pagination ------------------------------------------


@pytest.fixture
def three_vendors(logged_in):
    create(logged_in, name="Bravo", nature_of_service="SaaS", cost="300", renewal_date="2026-12-01")
    create(
        logged_in, name="alpha", nature_of_service="Hardware", cost="100", renewal_date="2026-03-01"
    )
    create(
        logged_in,
        name="Charlie",
        nature_of_service="Cloud SaaS",
        cost="200",
        renewal_date="2026-06-01",
    )
    return logged_in


def names(r):
    return [v["name"] for v in r.json()["items"]]


def test_list_default_sort_by_name_case_insensitive(three_vendors):
    r = three_vendors.get("/api/vendors")
    assert r.status_code == 200
    assert names(r) == ["alpha", "Bravo", "Charlie"]
    assert r.json()["total"] == 3


def test_list_sort_desc_by_cost(three_vendors):
    r = three_vendors.get("/api/vendors", params={"sort": "cost", "order": "desc"})
    assert names(r) == ["Bravo", "Charlie", "alpha"]


def test_list_sort_by_renewal_date(three_vendors):
    r = three_vendors.get("/api/vendors", params={"sort": "renewal_date"})
    assert names(r) == ["alpha", "Charlie", "Bravo"]


def test_list_search_by_name_and_nature_of_service(three_vendors):
    assert names(three_vendors.get("/api/vendors", params={"search": "ALP"})) == ["alpha"]
    assert names(three_vendors.get("/api/vendors", params={"search": "saas"})) == [
        "Bravo",
        "Charlie",
    ]


def test_list_search_treats_wildcards_literally(three_vendors):
    assert three_vendors.get("/api/vendors", params={"search": "%"}).json()["total"] == 0
    assert three_vendors.get("/api/vendors", params={"search": "_"}).json()["total"] == 0


def test_list_pagination(three_vendors):
    r = three_vendors.get("/api/vendors", params={"page": 2, "page_size": 2})
    assert names(r) == ["Charlie"]
    assert r.json() | {"items": None} == {"items": None, "total": 3, "page": 2, "page_size": 2}


@pytest.mark.parametrize(
    "params",
    [{"sort": "password_hash"}, {"order": "sideways"}, {"page": 0}, {"page_size": 101}],
)
def test_list_invalid_params_return_422(logged_in, params):
    assert logged_in.get("/api/vendors", params=params).status_code == 422
