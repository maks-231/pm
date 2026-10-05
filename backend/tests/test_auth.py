from fastapi.testclient import TestClient

from app import auth
from app.main import app


def test_session_requires_login():
    client = TestClient(app)

    response = client.get("/api/session")

    assert response.status_code == 401


def test_login_with_wrong_credentials_is_rejected():
    client = TestClient(app)

    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )

    assert response.status_code == 401
    assert client.cookies.get("session_token") is None


def test_login_then_session_then_logout():
    client = TestClient(app)

    login_response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert login_response.status_code == 200
    assert login_response.json() == {"username": "user"}
    assert client.cookies.get("session_token") is not None

    session_response = client.get("/api/session")
    assert session_response.status_code == 200
    assert session_response.json() == {"username": "user"}

    logout_response = client.post("/api/logout")
    assert logout_response.status_code == 204

    session_after_logout = client.get("/api/session")
    assert session_after_logout.status_code == 401


def test_each_client_has_an_independent_session():
    first_client = TestClient(app)
    second_client = TestClient(app)

    first_client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )

    assert second_client.get("/api/session").status_code == 401


def test_signup_creates_account_and_session_and_board():
    client = TestClient(app)

    response = client.post(
        "/api/signup", json={"username": "alice", "password": "wonderland123"}
    )

    assert response.status_code == 200
    assert response.json() == {"username": "alice"}
    assert client.cookies.get("session_token") is not None

    boards = client.get("/api/boards").json()
    assert len(boards) == 1
    board_response = client.get(f"/api/boards/{boards[0]['id']}")
    assert board_response.status_code == 200
    board = board_response.json()
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["cards"] == {}


def test_signup_with_duplicate_username_is_rejected():
    client = TestClient(app)
    client.post("/api/signup", json={"username": "bob", "password": "password123"})

    response = client.post(
        "/api/signup", json={"username": "bob", "password": "different123"}
    )

    assert response.status_code == 409


def test_signup_with_short_password_is_rejected():
    client = TestClient(app)

    response = client.post(
        "/api/signup", json={"username": "carol", "password": "short"}
    )

    assert response.status_code == 422


def test_verify_password_rejects_a_hash_that_isnt_valid_argon2():
    """A row seeded by an older version of this app (e.g. a raw SHA-256
    hex digest, pre-Part-11) must fail verification cleanly rather than
    raising argon2.exceptions.InvalidHashError."""
    old_style_hash = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d"

    assert auth.verify_password("password", old_style_hash) is False


def test_login_with_unreadable_hash_is_a_clean_401():
    from app import db

    conn = db.get_connection()
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE username = 'user'",
        ("not-a-valid-argon2-hash",),
    )
    conn.commit()
    conn.close()

    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )

    assert response.status_code == 401


def test_login_after_signup():
    client = TestClient(app)
    client.post("/api/signup", json={"username": "dave", "password": "password123"})
    client.post("/api/logout")

    response = client.post(
        "/api/login", json={"username": "dave", "password": "password123"}
    )

    assert response.status_code == 200
    assert response.json() == {"username": "dave"}
