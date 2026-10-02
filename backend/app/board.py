import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_username
from app.db import get_connection

router = APIRouter(prefix="/api/board", tags=["board"])


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardResponse(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class AddCardRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=2000)


class MoveCardRequest(BaseModel):
    column_id: str
    index: int = Field(ge=0)


def _get_user_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        # Should be unreachable: get_connection() seeds the hardcoded user.
        raise HTTPException(status_code=500, detail="User not found in database")
    return row["id"]


def _get_board_id(conn: sqlite3.Connection, user_id: int) -> str:
    row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row is None:
        # Should be unreachable: get_connection() seeds a board per user.
        raise HTTPException(status_code=500, detail="Board not found for user")
    return row["id"]


def _column_belongs_to_board(
    conn: sqlite3.Connection, column_id: str, board_id: str
) -> bool:
    row = conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    return row is not None


def _card_belongs_to_board(
    conn: sqlite3.Connection, card_id: str, board_id: str
) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM cards
        JOIN columns ON columns.id = cards.column_id
        WHERE cards.id = ? AND columns.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    return row is not None


def _serialize_board(conn: sqlite3.Connection, board_id: str) -> BoardResponse:
    column_rows = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    columns: list[Column] = []
    cards: dict[str, Card] = {}
    for column_row in column_rows:
        card_rows = conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? "
            "ORDER BY position",
            (column_row["id"],),
        ).fetchall()
        for card_row in card_rows:
            cards[card_row["id"]] = Card(
                id=card_row["id"],
                title=card_row["title"],
                details=card_row["details"],
            )
        columns.append(
            Column(
                id=column_row["id"],
                title=column_row["title"],
                cardIds=[card_row["id"] for card_row in card_rows],
            )
        )

    return BoardResponse(columns=columns, cards=cards)


def _board_id_for(conn: sqlite3.Connection, username: str) -> str:
    user_id = _get_user_id(conn, username)
    return _get_board_id(conn, user_id)


@router.get("", response_model=BoardResponse)
def get_board(
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        board_id = _board_id_for(conn, username)
        return _serialize_board(conn, board_id)
    finally:
        conn.close()


@router.patch("/columns/{column_id}", response_model=BoardResponse)
def rename_column(
    column_id: str,
    body: RenameColumnRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        board_id = _board_id_for(conn, username)
        if not _column_belongs_to_board(conn, column_id, board_id):
            raise HTTPException(status_code=404, detail="Column not found")

        conn.execute(
            "UPDATE columns SET title = ? WHERE id = ?", (body.title, column_id)
        )
        conn.commit()
        return _serialize_board(conn, board_id)
    finally:
        conn.close()


@router.post(
    "/columns/{column_id}/cards",
    response_model=BoardResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_card(
    column_id: str,
    body: AddCardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        board_id = _board_id_for(conn, username)
        if not _column_belongs_to_board(conn, column_id, board_id):
            raise HTTPException(status_code=404, detail="Column not found")

        next_position_row = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next_position "
            "FROM cards WHERE column_id = ?",
            (column_id,),
        ).fetchone()
        card_id = f"card-{secrets.token_hex(6)}"
        conn.execute(
            "INSERT INTO cards (id, column_id, title, details, position) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                card_id,
                column_id,
                body.title,
                body.details,
                next_position_row["next_position"],
            ),
        )
        conn.commit()
        return _serialize_board(conn, board_id)
    finally:
        conn.close()


@router.delete("/cards/{card_id}", response_model=BoardResponse)
def delete_card(
    card_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        board_id = _board_id_for(conn, username)
        if not _card_belongs_to_board(conn, card_id, board_id):
            raise HTTPException(status_code=404, detail="Card not found")

        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        conn.commit()
        return _serialize_board(conn, board_id)
    finally:
        conn.close()


@router.patch("/cards/{card_id}/move", response_model=BoardResponse)
def move_card(
    card_id: str,
    body: MoveCardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        board_id = _board_id_for(conn, username)
        if not _card_belongs_to_board(conn, card_id, board_id):
            raise HTTPException(status_code=404, detail="Card not found")
        if not _column_belongs_to_board(conn, body.column_id, board_id):
            raise HTTPException(status_code=404, detail="Target column not found")

        target_rows = conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
            (body.column_id,),
        ).fetchall()
        target_ids = [row["id"] for row in target_rows if row["id"] != card_id]
        index = min(body.index, len(target_ids))
        target_ids.insert(index, card_id)

        # Two phases to avoid tripping the (column_id, position) UNIQUE
        # constraint against rows not yet moved out of the way: stage
        # everything at negative positions first, then assign final ones.
        for offset, cid in enumerate(target_ids):
            conn.execute(
                "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
                (body.column_id, -(offset + 1), cid),
            )
        for position, cid in enumerate(target_ids):
            conn.execute(
                "UPDATE cards SET position = ? WHERE id = ?", (position, cid)
            )
        conn.commit()
        return _serialize_board(conn, board_id)
    finally:
        conn.close()
