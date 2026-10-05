import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Point every test at its own throwaway SQLite file."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")


@pytest.fixture
def authed_client():
    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return client


@pytest.fixture
def board_id(authed_client):
    """The seeded user's one (first) board id."""
    boards = authed_client.get("/api/boards").json()
    return boards[0]["id"]


def signup_and_login(username: str, password: str = "password123") -> TestClient:
    """Create a fresh user via /api/signup and return a client holding its session."""
    client = TestClient(app)
    response = client.post(
        "/api/signup", json={"username": username, "password": password}
    )
    assert response.status_code == 200
    return client
