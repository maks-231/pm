from fastapi.testclient import TestClient

from app.main import app


def test_ping_requires_login():
    client = TestClient(app)
    response = client.post("/api/ai/ping")
    assert response.status_code == 401


def test_ping_fails_cleanly_without_api_key(authed_client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    response = authed_client.post("/api/ai/ping")

    assert response.status_code == 503


def test_ping_returns_four(authed_client):
    """Live connectivity check against the real Anthropic API, matching
    docs/PLAN.md Part 8: proves the key and model actually work end to end.
    Requires ANTHROPIC_API_KEY to be set (see backend/AGENTS.md)."""
    response = authed_client.post("/api/ai/ping")

    assert response.status_code == 200
    assert "4" in response.json()["reply"]
