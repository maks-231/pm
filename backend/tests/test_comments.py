from tests.conftest import signup_and_login


def test_add_and_list_comments(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/cards/card-1/comments", json={"body": "Looks good"}
    )
    assert response.status_code == 201
    comment = response.json()
    assert comment["body"] == "Looks good"
    assert comment["author"] == "user"
    assert comment["createdAt"]

    listed = authed_client.get(
        f"/api/boards/{board_id}/cards/card-1/comments"
    ).json()
    assert len(listed) == 1
    assert listed[0]["body"] == "Looks good"


def test_comments_are_attributed_to_the_real_logged_in_user(authed_client, board_id):
    other_client = signup_and_login("comment-author")
    other_board = other_client.get("/api/boards").json()[0]
    first_column_id = other_client.get(f"/api/boards/{other_board['id']}").json()[
        "columns"
    ][0]["id"]
    card = other_client.post(
        f"/api/boards/{other_board['id']}/columns/{first_column_id}/cards",
        json={"title": "A card"},
    ).json()
    card_id = next(
        c for c in card["columns"] if c["id"] == first_column_id
    )["cardIds"][0]

    response = other_client.post(
        f"/api/boards/{other_board['id']}/cards/{card_id}/comments",
        json={"body": "My comment"},
    )
    assert response.json()["author"] == "comment-author"


def test_comment_count_reflected_on_board(authed_client, board_id):
    authed_client.post(
        f"/api/boards/{board_id}/cards/card-1/comments", json={"body": "One"}
    )
    authed_client.post(
        f"/api/boards/{board_id}/cards/card-1/comments", json={"body": "Two"}
    )

    board = authed_client.get(f"/api/boards/{board_id}").json()
    assert board["cards"]["card-1"]["commentCount"] == 2
    assert board["cards"]["card-2"]["commentCount"] == 0


def test_add_comment_on_unknown_card_is_404(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/cards/does-not-exist/comments",
        json={"body": "x"},
    )
    assert response.status_code == 404


def test_list_comments_on_unknown_card_is_404(authed_client, board_id):
    response = authed_client.get(
        f"/api/boards/{board_id}/cards/does-not-exist/comments"
    )
    assert response.status_code == 404


def test_add_comment_requires_nonempty_body(authed_client, board_id):
    response = authed_client.post(
        f"/api/boards/{board_id}/cards/card-1/comments", json={"body": ""}
    )
    assert response.status_code == 422


def test_comment_on_another_users_board_is_404(authed_client, board_id):
    other_client = signup_and_login("comments-other-user")

    response = other_client.post(
        f"/api/boards/{board_id}/cards/card-1/comments", json={"body": "Hijacked"}
    )
    assert response.status_code == 404
