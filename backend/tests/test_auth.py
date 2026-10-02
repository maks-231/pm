from fastapi.testclient import TestClient

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
