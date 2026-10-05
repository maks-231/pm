import json
import os
from typing import Annotated, Literal

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.auth import get_current_username
from app.board import (
    BoardResponse,
    add_card_db,
    delete_card_db,
    move_card_db,
    rename_column_db,
    require_board,
    serialize_board,
)
from app.db import get_connection

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
PING_PROMPT = "What is 2+2? Answer with only the number."

router = APIRouter(tags=["ai"])


class PingResponse(BaseModel):
    reply: str


@router.post("/api/ai/ping", response_model=PingResponse)
def ping(
    _username: Annotated[str, Depends(get_current_username)],
) -> PingResponse:
    client, model = _get_client_and_model()

    try:
        message = client.messages.create(
            model=model,
            max_tokens=16,
            messages=[{"role": "user", "content": PING_PROMPT}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Anthropic API call failed: {exc}",
        ) from exc

    reply = "".join(
        block.text for block in message.content if block.type == "text"
    )
    return PingResponse(reply=reply)


# --- Chat with structured output -----------------------------------------
#
# Conversation history is entirely client-owned and stateless on the
# server: the frontend resends the growing `history` array with every
# request (see ChatRequest below), and the backend never stores it. This
# keeps chat consistent with the rest of the MVP's ephemeral state
# (sessions are also in-memory, lost on restart — see app/auth.py) and
# avoids a second persistence mechanism for what's inherently scrollback,
# not data the user asked us to keep safe. `history` holds only prior
# turns; the backend appends the new user message itself.

SYSTEM_PROMPT = """\
You are an AI assistant embedded in a Kanban board app called Kanban Studio. \
You can chat with the user about their board and, when it's appropriate, \
propose changes to it.

The board is organized as columns (each with an id, a title, and an \
ordered list of card ids) and cards (each with an id, a title, and a \
details text). You will be given the current board as JSON before every \
user message.

You must always respond by calling the `respond` tool. Set `operations` \
to an empty list if the user's message doesn't call for a board change.

Available operation types:
- rename_column: requires column_id, title
- add_card: requires column_id, title (details is optional)
- delete_card: requires card_id
- move_card: requires card_id, column_id (the target column), index \
(0-based position within that column's cards after the move)

Only reference column_id/card_id values that actually appear in the board \
JSON you were given. If a request is ambiguous or refers to something \
that doesn't exist on the board, say so in your reply and leave \
operations empty rather than guessing.\
"""

RESPOND_TOOL = {
    "name": "respond",
    "description": (
        "Reply to the user and optionally propose board operations to apply."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "reply": {
                "type": "string",
                "description": "The chat reply to show the user.",
            },
            "operations": {
                "type": "array",
                "description": (
                    "Zero or more board operations to apply, in order. "
                    "Empty if the message doesn't call for a change."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "rename_column",
                                "add_card",
                                "delete_card",
                                "move_card",
                            ],
                        },
                        "column_id": {"type": "string"},
                        "card_id": {"type": "string"},
                        "title": {"type": "string"},
                        "details": {"type": "string"},
                        "index": {"type": "integer"},
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["reply", "operations"],
    },
}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    board: BoardResponse


class Operation(BaseModel):
    type: Literal["rename_column", "add_card", "delete_card", "move_card"]
    column_id: str | None = None
    card_id: str | None = None
    title: str | None = None
    details: str | None = None
    index: int | None = None


class StructuredReply(BaseModel):
    reply: str
    operations: list[Operation] = Field(default_factory=list)


def _get_client_and_model() -> tuple[anthropic.Anthropic, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured",
        )
    model = os.environ.get("CHAT_MODEL") or DEFAULT_MODEL
    return anthropic.Anthropic(api_key=api_key), model


def _request_structured_reply(
    client: anthropic.Anthropic,
    model: str,
    messages: list[dict],
) -> StructuredReply:
    """Call the model forcing the `respond` tool, validating its input.
    Retries once with a corrective nudge if the output doesn't match the
    expected shape, then gives up rather than looping indefinitely."""
    attempt_messages = messages
    last_error: Exception | None = None

    for _ in range(2):
        try:
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=attempt_messages,
                tools=[RESPOND_TOOL],
                tool_choice={"type": "tool", "name": "respond"},
            )
        except anthropic.APIError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Anthropic API call failed: {exc}",
            ) from exc

        tool_use = next(
            (block for block in message.content if block.type == "tool_use"),
            None,
        )
        if tool_use is not None:
            try:
                return StructuredReply.model_validate(tool_use.input)
            except ValidationError as exc:
                last_error = exc
        else:
            last_error = ValueError("model did not call the respond tool")

        attempt_messages = [
            *messages,
            {
                "role": "assistant",
                "content": json.dumps(tool_use.input) if tool_use else "",
            },
            {
                "role": "user",
                "content": (
                    "Your previous response didn't match the required "
                    "schema. Call the `respond` tool again, with `reply` "
                    "as a string and `operations` as an array."
                ),
            },
        ]

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"AI returned an unexpected response: {last_error}",
    )


def _apply_operation(conn, board_id: str, op: Operation) -> None:
    """Applies one AI-proposed operation, skipping it silently if it's
    missing required fields or references ids that don't exist on this
    board — a malformed individual operation shouldn't fail the whole
    chat turn (the user still gets their reply)."""
    if op.type == "rename_column":
        if op.column_id and op.title:
            rename_column_db(conn, board_id, op.column_id, op.title)
    elif op.type == "add_card":
        if op.column_id and op.title:
            add_card_db(conn, board_id, op.column_id, op.title, op.details or "")
    elif op.type == "delete_card":
        if op.card_id:
            delete_card_db(conn, board_id, op.card_id)
    elif op.type == "move_card":
        if op.card_id and op.column_id and op.index is not None:
            move_card_db(conn, board_id, op.card_id, op.column_id, op.index)


@router.post("/api/boards/{board_id}/ai/chat", response_model=ChatResponse)
def chat(
    board_id: str,
    body: ChatRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> ChatResponse:
    client, model = _get_client_and_model()

    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        board_json = serialize_board(conn, board_id).model_dump_json()

        messages = [
            {"role": entry.role, "content": entry.content} for entry in body.history
        ]
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Current board state (JSON):\n{board_json}\n\n"
                    f"User message: {body.message}"
                ),
            }
        )

        structured = _request_structured_reply(client, model, messages)

        for operation in structured.operations:
            _apply_operation(conn, board_id, operation)
        conn.commit()

        return ChatResponse(
            reply=structured.reply,
            board=serialize_board(conn, board_id),
        )
    finally:
        conn.close()
