from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_hello_returns_message():
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello from FastAPI"}


def test_static_index_is_served():
    """Requires scripts/build-frontend.sh to have populated backend/static."""
    response = client.get("/")

    assert response.status_code == 200
    assert "<title>Kanban Studio</title>" in response.text
