from tests.conftest import signup_and_login


def test_update_card_due_date_persists(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"due_date": "2026-11-01"}
    )
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["dueDate"] == "2026-11-01"

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert refetched["cards"]["card-1"]["dueDate"] == "2026-11-01"


def test_update_card_assignee_persists(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"assignee_text": "Alex"}
    )
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["assigneeText"] == "Alex"


def test_update_card_title_and_details_persist(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1",
        json={"title": "New title", "details": "New details"},
    )
    assert response.status_code == 200
    card = response.json()["cards"]["card-1"]
    assert card["title"] == "New title"
    assert card["details"] == "New details"


def test_update_card_rejects_empty_title(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"title": ""}
    )
    assert response.status_code == 422


def test_clearing_due_date_with_empty_string_sets_it_to_null(authed_client, board_id):
    authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"due_date": "2026-11-01"}
    )

    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"due_date": ""}
    )
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["dueDate"] is None


def test_omitted_fields_are_left_unchanged(authed_client, board_id):
    authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"assignee_text": "Alex"}
    )

    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"due_date": "2026-12-01"}
    )
    assert response.status_code == 200
    card = response.json()["cards"]["card-1"]
    assert card["dueDate"] == "2026-12-01"
    assert card["assigneeText"] == "Alex"


def test_update_unknown_card_is_404(authed_client, board_id):
    response = authed_client.patch(
        f"/api/boards/{board_id}/cards/does-not-exist", json={"title": "x"}
    )
    assert response.status_code == 404


def test_update_card_on_another_users_board_is_404(authed_client, board_id):
    other_client = signup_and_login("card-metadata-other-user")

    response = other_client.patch(
        f"/api/boards/{board_id}/cards/card-1", json={"title": "Hijacked"}
    )
    assert response.status_code == 404


def test_set_labels_creates_and_persists(authed_client, board_id):
    response = authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels",
        json={"label_names": ["Urgent", "Bug"]},
    )
    assert response.status_code == 200
    labels = response.json()["cards"]["card-1"]["labels"]
    assert {label["name"] for label in labels} == {"Urgent", "Bug"}
    assert all(label["color"] for label in labels)

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert {label["name"] for label in refetched["cards"]["card-1"]["labels"]} == {
        "Urgent",
        "Bug",
    }


def test_set_labels_reuses_existing_label_on_the_same_board(authed_client, board_id):
    authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels",
        json={"label_names": ["Urgent"]},
    )
    authed_client.put(
        f"/api/boards/{board_id}/cards/card-2/labels",
        json={"label_names": ["Urgent"]},
    )

    labels = authed_client.get(f"/api/boards/{board_id}/labels").json()
    urgent_labels = [label for label in labels if label["name"] == "Urgent"]
    assert len(urgent_labels) == 1


def test_set_labels_replaces_the_cards_label_set(authed_client, board_id):
    authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels",
        json={"label_names": ["Urgent", "Bug"]},
    )

    response = authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels",
        json={"label_names": ["Bug"]},
    )
    assert response.status_code == 200
    labels = response.json()["cards"]["card-1"]["labels"]
    assert [label["name"] for label in labels] == ["Bug"]


def test_label_colors_cycle_through_the_five_brand_colors(authed_client, board_id):
    names = ["L1", "L2", "L3", "L4", "L5", "L6"]
    authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels", json={"label_names": names}
    )

    labels = authed_client.get(f"/api/boards/{board_id}/labels").json()
    by_name = {label["name"]: label["color"] for label in labels}
    assert by_name["L1"] == by_name["L6"]
    assert by_name["L1"] != by_name["L2"]


def test_set_labels_on_unknown_card_is_404(authed_client, board_id):
    response = authed_client.put(
        f"/api/boards/{board_id}/cards/does-not-exist/labels",
        json={"label_names": ["Urgent"]},
    )
    assert response.status_code == 404


def test_labels_are_isolated_per_board(authed_client, board_id):
    authed_client.put(
        f"/api/boards/{board_id}/cards/card-1/labels",
        json={"label_names": ["Urgent"]},
    )

    other_client = signup_and_login("labels-other-user")
    other_board_id = other_client.get("/api/boards").json()[0]["id"]

    other_labels = other_client.get(f"/api/boards/{other_board_id}/labels").json()
    assert other_labels == []
