from tests.conftest import signup_and_login


def test_list_boards_returns_the_seeded_board(authed_client, board_id):
    response = authed_client.get("/api/boards")
    assert response.status_code == 200
    boards = response.json()
    assert [b["id"] for b in boards] == [board_id]
    assert boards[0]["name"] == "Board 1"


def test_create_board_adds_a_new_board_with_default_columns(authed_client):
    response = authed_client.post("/api/boards", json={"name": "Side project"})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Side project"

    board = authed_client.get(f"/api/boards/{created['id']}").json()
    assert [c["title"] for c in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["cards"] == {}

    boards = authed_client.get("/api/boards").json()
    assert len(boards) == 2


def test_rename_board_persists(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}", json={"name": "Renamed"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"

    boards = authed_client.get("/api/boards").json()
    assert boards[0]["name"] == "Renamed"


def test_delete_board_removes_it(authed_client):
    created = authed_client.post("/api/boards", json={"name": "Temp"}).json()

    response = authed_client.delete(f"/api/boards/{created['id']}")
    assert response.status_code == 204

    boards = authed_client.get("/api/boards").json()
    assert created["id"] not in [b["id"] for b in boards]
    assert authed_client.get(f"/api/boards/{created['id']}").status_code == 404


def test_deleting_the_last_board_leaves_an_empty_list(authed_client, board_id):
    response = authed_client.delete(f"/api/boards/{board_id}")
    assert response.status_code == 204

    assert authed_client.get("/api/boards").json() == []


def test_user_cannot_access_another_users_board(authed_client, board_id):
    other_client = signup_and_login("other-user")

    response = other_client.get(f"/api/boards/{board_id}")
    assert response.status_code == 404

    response = other_client.patch(
        f"/api/boards/{board_id}", json={"name": "Hijacked"}
    )
    assert response.status_code == 404

    response = other_client.delete(f"/api/boards/{board_id}")
    assert response.status_code == 404


def test_user_cannot_see_another_users_board_in_list(authed_client):
    other_client = signup_and_login("another-user")

    other_boards = other_client.get("/api/boards").json()
    assert len(other_boards) == 1

    my_boards = authed_client.get("/api/boards").json()
    assert set(b["id"] for b in other_boards).isdisjoint(
        set(b["id"] for b in my_boards)
    )
