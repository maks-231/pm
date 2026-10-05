from types import SimpleNamespace

from app import ai


class FakeMessages:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.messages = FakeMessages(responses)


def tool_response(reply, operations):
    block = SimpleNamespace(
        type="tool_use", input={"reply": reply, "operations": operations}
    )
    return SimpleNamespace(content=[block])


def text_only_response(text):
    block = SimpleNamespace(type="text", text=text)
    return SimpleNamespace(content=[block])


def install_fake_ai(monkeypatch, responses):
    fake_client = FakeClient(responses)
    monkeypatch.setattr(ai, "_get_client_and_model", lambda: (fake_client, "fake-model"))
    return fake_client


def test_chat_requires_login():
    import app.main as main_module

    from fastapi.testclient import TestClient

    client = TestClient(main_module.app)
    response = client.post(
        "/api/boards/irrelevant-board/ai/chat", json={"message": "hi", "history": []}
    )
    assert response.status_code == 401


def test_chat_with_no_intended_mutation_leaves_board_unchanged(
    authed_client, board_id, monkeypatch
):
    install_fake_ai(
        monkeypatch,
        [tool_response("Backlog has 2 cards.", [])],
    )

    before = authed_client.get(f"/api/boards/{board_id}").json()

    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": "What's in my Backlog column?", "history": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Backlog has 2 cards."
    assert body["board"] == before


def test_chat_add_card_mutates_and_persists_board(authed_client, board_id, monkeypatch):
    install_fake_ai(
        monkeypatch,
        [
            tool_response(
                "Added it.",
                [
                    {
                        "type": "add_card",
                        "column_id": "col-backlog",
                        "title": "Test AI card",
                        "details": "",
                    }
                ],
            )
        ],
    )

    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={
            "message": "Add a card titled 'Test AI card' to Backlog",
            "history": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    backlog = next(c for c in body["board"]["columns"] if c["id"] == "col-backlog")
    new_card_id = backlog["cardIds"][-1]
    assert body["board"]["cards"][new_card_id]["title"] == "Test AI card"

    refetched = authed_client.get(f"/api/boards/{board_id}").json()
    assert refetched["cards"][new_card_id]["title"] == "Test AI card"


def test_chat_skips_operation_with_unknown_column_without_failing(
    authed_client, board_id, monkeypatch
):
    install_fake_ai(
        monkeypatch,
        [
            tool_response(
                "Done.",
                [
                    {
                        "type": "add_card",
                        "column_id": "does-not-exist",
                        "title": "Orphan card",
                    }
                ],
            )
        ],
    )

    before = authed_client.get(f"/api/boards/{board_id}").json()
    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": "add it somewhere odd", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["board"] == before


def test_chat_handles_malformed_model_output_gracefully(
    authed_client, board_id, monkeypatch
):
    fake_client = install_fake_ai(
        monkeypatch,
        [text_only_response("I refuse to use tools"), text_only_response("still no")],
    )

    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat", json={"message": "hi", "history": []}
    )

    assert response.status_code == 502
    assert len(fake_client.messages.calls) == 2


def test_chat_includes_history_in_the_model_request(
    authed_client, board_id, monkeypatch
):
    fake_client = install_fake_ai(
        monkeypatch,
        [tool_response("Sure, I remember.", [])],
    )

    history = [
        {"role": "user", "content": "My favorite column is Review."},
        {"role": "assistant", "content": "Noted!"},
    ]
    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": "What's my favorite column?", "history": history},
    )

    assert response.status_code == 200
    sent_messages = fake_client.messages.calls[0]["messages"]
    assert sent_messages[0] == {
        "role": "user",
        "content": "My favorite column is Review.",
    }
    assert sent_messages[1] == {"role": "assistant", "content": "Noted!"}
    assert sent_messages[2]["role"] == "user"
    assert "What's my favorite column?" in sent_messages[2]["content"]
    assert "Current board state" in sent_messages[2]["content"]


def test_chat_live_smoke(authed_client, board_id):
    """Real call to the Anthropic API, matching docs/PLAN.md Part 9's
    acceptance of a live smoke test alongside the mocked cases above."""
    response = authed_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": "Reply with the single word: pong", "history": []},
    )

    assert response.status_code == 200
    assert "pong" in response.json()["reply"].lower()
