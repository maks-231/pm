import sqlite3

from app import db


def test_db_file_created_with_expected_tables(tmp_path, monkeypatch):
    db_path = tmp_path / "fresh.db"
    monkeypatch.setattr(db, "DB_PATH", db_path)

    assert not db_path.exists()
    conn = db.get_connection()
    conn.close()

    assert db_path.exists()

    conn = sqlite3.connect(db_path)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    conn.close()
    assert {"users", "boards", "columns", "cards"} <= tables


def test_get_board_requires_login(board_id):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get(f"/api/boards/{board_id}")
    assert response.status_code == 401


def test_get_board_returns_seeded_data(authed_client, board_id):
    response = authed_client.get(f"/api/boards/{board_id}")
    assert response.status_code == 200

    body = response.json()
    assert [c["id"] for c in body["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert len(body["cards"]) == 8
    assert body["cards"]["card-1"]["title"] == "Align roadmap themes"
    backlog = body["columns"][0]
    assert backlog["cardIds"] == ["card-1", "card-2"]


def test_rename_column_persists(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/columns/col-backlog", json={"title": "Triage"}
    )
    assert response.status_code == 200
    assert response.json()["columns"][0]["title"] == "Triage"

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert refetched["columns"][0]["title"] == "Triage"


def test_rename_unknown_column_is_404(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/columns/does-not-exist", json={"title": "Triage"}
    )
    assert response.status_code == 404


def test_rename_column_rejects_empty_title(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/columns/col-backlog", json={"title": ""}
    )
    assert response.status_code == 422


def test_add_card_persists(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/columns/col-review/cards",
        json={"title": "New card", "details": "Some notes"},
    )
    assert response.status_code == 201
    body = response.json()
    review_column = next(c for c in body["columns"] if c["id"] == "col-review")
    assert len(review_column["cardIds"]) == 2
    new_card_id = review_column["cardIds"][-1]
    assert body["cards"][new_card_id]["title"] == "New card"

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert new_card_id in refetched["cards"]


def test_add_card_to_unknown_column_is_404(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/columns/does-not-exist/cards",
        json={"title": "New card"},
    )
    assert response.status_code == 404


def test_add_card_requires_title(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/columns/col-review/cards",
        json={"details": "no title"},
    )
    assert response.status_code == 422


def test_delete_card_persists(authed_client, board_id):
    response = authed_client.delete(f"/api/boards/{board_id}/cards/card-1")
    assert response.status_code == 200
    assert "card-1" not in response.json()["cards"]

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert "card-1" not in refetched["cards"]
    assert "card-1" not in refetched["columns"][0]["cardIds"]


def test_delete_unknown_card_is_404(authed_client, board_id):
    response = authed_client.delete(f"/api/boards/{board_id}/cards/does-not-exist")
    assert response.status_code == 404


def test_move_card_within_same_column(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-2/move",
        json={"column_id": "col-backlog", "index": 0},
    )
    assert response.status_code == 200
    backlog = response.json()["columns"][0]
    assert backlog["cardIds"] == ["card-2", "card-1"]


def test_move_card_across_columns(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1/move",
        json={"column_id": "col-done", "index": 0},
    )
    assert response.status_code == 200
    body = response.json()
    backlog = next(c for c in body["columns"] if c["id"] == "col-backlog")
    done = next(c for c in body["columns"] if c["id"] == "col-done")
    assert "card-1" not in backlog["cardIds"]
    assert done["cardIds"] == ["card-1", "card-7", "card-8"]

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    refetched_done = next(
        c for c in refetched["columns"] if c["id"] == "col-done"
    )
    assert refetched_done["cardIds"] == ["card-1", "card-7", "card-8"]


def test_move_unknown_card_is_404(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/does-not-exist/move",
        json={"column_id": "col-backlog", "index": 0},
    )
    assert response.status_code == 404


def test_move_card_to_unknown_column_is_404(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1/move",
        json={"column_id": "does-not-exist", "index": 0},
    )
    assert response.status_code == 404


def test_board_routes_require_login_even_for_mutations(board_id):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert (
        client.patch(
            f"/api/boards/{board_id}/columns/col-backlog", json={"title": "x"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"/api/boards/{board_id}/columns/col-backlog/cards", json={"title": "x"}
        ).status_code
        == 401
    )
    assert client.delete(f"/api/boards/{board_id}/cards/card-1").status_code == 401
    assert (
        client.patch(
            f"/api/boards/{board_id}/cards/card-1/move",
            json={"column_id": "col-backlog", "index": 0},
        ).status_code
        == 401
    )
