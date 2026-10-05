import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_username
from app.db import get_connection

router = APIRouter(prefix="/api/boards", tags=["board"])

DEFAULT_COLUMN_TITLES = [
    "Backlog",
    "Discovery",
    "In Progress",
    "Review",
    "Done",
]

# Brand colors from AGENTS.md, cycled by creation order for new labels.
LABEL_COLORS = ["#ecad0a", "#209dd7", "#753991", "#032147", "#888888"]

UPDATABLE_CARD_FIELDS = {"title", "details", "due_date", "assignee_text"}
NULLABLE_CARD_FIELDS = {"due_date", "assignee_text"}


class Label(BaseModel):
    id: str
    name: str
    color: str


class Card(BaseModel):
    id: str
    title: str
    details: str
    dueDate: str | None = None
    assigneeText: str | None = None
    labels: list[Label] = Field(default_factory=list)
    commentCount: int = 0


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardResponse(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class BoardSummary(BaseModel):
    id: str
    name: str


class CreateBoardRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RenameBoardRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class AddCardRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=2000)


class MoveCardRequest(BaseModel):
    column_id: str
    index: int = Field(ge=0)


class UpdateCardRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=2000)
    due_date: str | None = None
    assignee_text: str | None = Field(default=None, max_length=100)


class SetCardLabelsRequest(BaseModel):
    label_names: list[str] = Field(default_factory=list)


class CommentResponse(BaseModel):
    id: str
    author: str
    body: str
    createdAt: str


class AddCommentRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def get_user_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        # Should be unreachable: a session can only exist for a username
        # that was written to the users table at signup/seed time.
        raise HTTPException(status_code=500, detail="User not found in database")
    return row["id"]


def user_owns_board(conn: sqlite3.Connection, user_id: int, board_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM boards WHERE id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    return row is not None


def require_board(conn: sqlite3.Connection, username: str, board_id: str) -> None:
    user_id = get_user_id(conn, username)
    if not user_owns_board(conn, user_id, board_id):
        raise HTTPException(status_code=404, detail="Board not found")


def column_belongs_to_board(
    conn: sqlite3.Connection, column_id: str, board_id: str
) -> bool:
    row = conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    return row is not None


def card_belongs_to_board(
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


def serialize_board(conn: sqlite3.Connection, board_id: str) -> BoardResponse:
    column_rows = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    columns: list[Column] = []
    cards: dict[str, Card] = {}
    for column_row in column_rows:
        card_rows = conn.execute(
            "SELECT id, title, details, due_date, assignee_text FROM cards "
            "WHERE column_id = ? ORDER BY position",
            (column_row["id"],),
        ).fetchall()
        for card_row in card_rows:
            cards[card_row["id"]] = Card(
                id=card_row["id"],
                title=card_row["title"],
                details=card_row["details"],
                dueDate=card_row["due_date"],
                assigneeText=card_row["assignee_text"],
            )
        columns.append(
            Column(
                id=column_row["id"],
                title=column_row["title"],
                cardIds=[card_row["id"] for card_row in card_rows],
            )
        )

    if cards:
        label_rows = conn.execute(
            """
            SELECT card_labels.card_id AS card_id, labels.id AS id,
                   labels.name AS name, labels.color AS color
            FROM card_labels
            JOIN labels ON labels.id = card_labels.label_id
            JOIN cards ON cards.id = card_labels.card_id
            JOIN columns ON columns.id = cards.column_id
            WHERE columns.board_id = ?
            """,
            (board_id,),
        ).fetchall()
        for label_row in label_rows:
            cards[label_row["card_id"]].labels.append(
                Label(
                    id=label_row["id"],
                    name=label_row["name"],
                    color=label_row["color"],
                )
            )

        comment_count_rows = conn.execute(
            """
            SELECT cards.id AS card_id, COUNT(comments.id) AS comment_count
            FROM cards
            JOIN columns ON columns.id = cards.column_id
            LEFT JOIN comments ON comments.card_id = cards.id
            WHERE columns.board_id = ?
            GROUP BY cards.id
            """,
            (board_id,),
        ).fetchall()
        for row in comment_count_rows:
            cards[row["card_id"]].commentCount = row["comment_count"]

    return BoardResponse(columns=columns, cards=cards)


# --- Board CRUD (pure DB functions) -------------------------------------


def list_boards_db(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT id, name FROM boards WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()


def create_board_db(conn: sqlite3.Connection, user_id: int, name: str) -> str:
    board_id = f"board-{secrets.token_hex(6)}"
    conn.execute(
        "INSERT INTO boards (id, user_id, name) VALUES (?, ?, ?)",
        (board_id, user_id, name),
    )
    for position, title in enumerate(DEFAULT_COLUMN_TITLES):
        column_id = f"col-{secrets.token_hex(6)}"
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column_id, board_id, title, position),
        )
    return board_id


def rename_board_db(conn: sqlite3.Connection, board_id: str, name: str) -> bool:
    cursor = conn.execute(
        "UPDATE boards SET name = ? WHERE id = ?", (name, board_id)
    )
    return cursor.rowcount > 0


def delete_board_db(conn: sqlite3.Connection, board_id: str) -> bool:
    cursor = conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    return cursor.rowcount > 0


# --- Pure DB mutations -------------------------------------------------
# Shared by the HTTP routes below and app/ai.py's operation applier. These
# never commit themselves (the caller controls the transaction boundary)
# and report success via return value rather than raising, so a caller can
# decide how to react to a not-found id (HTTP 404 vs. silently skipping an
# AI-proposed operation that referenced a stale id).


def rename_column_db(
    conn: sqlite3.Connection, board_id: str, column_id: str, title: str
) -> bool:
    if not column_belongs_to_board(conn, column_id, board_id):
        return False
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    return True


def add_card_db(
    conn: sqlite3.Connection,
    board_id: str,
    column_id: str,
    title: str,
    details: str = "",
) -> str | None:
    if not column_belongs_to_board(conn, column_id, board_id):
        return None
    next_position_row = conn.execute(
        "SELECT COALESCE(MAX(position) + 1, 0) AS next_position "
        "FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()
    card_id = f"card-{secrets.token_hex(6)}"
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, position) "
        "VALUES (?, ?, ?, ?, ?)",
        (card_id, column_id, title, details, next_position_row["next_position"]),
    )
    return card_id


def delete_card_db(conn: sqlite3.Connection, board_id: str, card_id: str) -> bool:
    if not card_belongs_to_board(conn, card_id, board_id):
        return False
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    return True


def move_card_db(
    conn: sqlite3.Connection,
    board_id: str,
    card_id: str,
    column_id: str,
    index: int,
) -> bool:
    if not card_belongs_to_board(conn, card_id, board_id):
        return False
    if not column_belongs_to_board(conn, column_id, board_id):
        return False

    target_rows = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
        (column_id,),
    ).fetchall()
    target_ids = [row["id"] for row in target_rows if row["id"] != card_id]
    index = min(max(index, 0), len(target_ids))
    target_ids.insert(index, card_id)

    # Two phases to avoid tripping the (column_id, position) UNIQUE
    # constraint against rows not yet moved out of the way: stage
    # everything at negative positions first, then assign final ones.
    for offset, cid in enumerate(target_ids):
        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (column_id, -(offset + 1), cid),
        )
    for position, cid in enumerate(target_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (position, cid))
    return True


def update_card_db(
    conn: sqlite3.Connection,
    board_id: str,
    card_id: str,
    fields: dict[str, str | None],
) -> bool:
    if not card_belongs_to_board(conn, card_id, board_id):
        return False
    updates = {
        key: (None if key in NULLABLE_CARD_FIELDS and value == "" else value)
        for key, value in fields.items()
        if key in UPDATABLE_CARD_FIELDS
    }
    if not updates:
        return True
    set_clause = ", ".join(f"{key} = ?" for key in updates)
    conn.execute(
        f"UPDATE cards SET {set_clause} WHERE id = ?",
        (*updates.values(), card_id),
    )
    return True


def _get_or_create_label_db(conn: sqlite3.Connection, board_id: str, name: str) -> str:
    row = conn.execute(
        "SELECT id FROM labels WHERE board_id = ? AND name = ?", (board_id, name)
    ).fetchone()
    if row is not None:
        return row["id"]
    count_row = conn.execute(
        "SELECT COUNT(*) AS n FROM labels WHERE board_id = ?", (board_id,)
    ).fetchone()
    color = LABEL_COLORS[count_row["n"] % len(LABEL_COLORS)]
    label_id = f"label-{secrets.token_hex(6)}"
    conn.execute(
        "INSERT INTO labels (id, board_id, name, color) VALUES (?, ?, ?, ?)",
        (label_id, board_id, name, color),
    )
    return label_id


def set_labels_db(
    conn: sqlite3.Connection, board_id: str, card_id: str, label_names: list[str]
) -> bool:
    if not card_belongs_to_board(conn, card_id, board_id):
        return False
    unique_names = list(dict.fromkeys(name.strip() for name in label_names if name.strip()))
    label_ids = [_get_or_create_label_db(conn, board_id, name) for name in unique_names]
    conn.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
    for label_id in label_ids:
        conn.execute(
            "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)",
            (card_id, label_id),
        )
    return True


def list_labels_db(conn: sqlite3.Connection, board_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT id, name, color FROM labels WHERE board_id = ? ORDER BY name",
        (board_id,),
    ).fetchall()


def add_comment_db(
    conn: sqlite3.Connection,
    board_id: str,
    card_id: str,
    user_id: int,
    body: str,
) -> str | None:
    if not card_belongs_to_board(conn, card_id, board_id):
        return None
    comment_id = f"comment-{secrets.token_hex(6)}"
    conn.execute(
        "INSERT INTO comments (id, card_id, author_user_id, body) "
        "VALUES (?, ?, ?, ?)",
        (comment_id, card_id, user_id, body),
    )
    return comment_id


def list_comments_db(
    conn: sqlite3.Connection, board_id: str, card_id: str
) -> list[sqlite3.Row] | None:
    if not card_belongs_to_board(conn, card_id, board_id):
        return None
    return conn.execute(
        """
        SELECT comments.id AS id, users.username AS author,
               comments.body AS body, comments.created_at AS created_at
        FROM comments
        JOIN users ON users.id = comments.author_user_id
        WHERE comments.card_id = ?
        ORDER BY comments.created_at
        """,
        (card_id,),
    ).fetchall()


# --- HTTP routes ---------------------------------------------------------


@router.get("", response_model=list[BoardSummary])
def list_boards(
    username: Annotated[str, Depends(get_current_username)],
) -> list[BoardSummary]:
    conn = get_connection()
    try:
        user_id = get_user_id(conn, username)
        rows = list_boards_db(conn, user_id)
        return [BoardSummary(id=row["id"], name=row["name"]) for row in rows]
    finally:
        conn.close()


@router.post("", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def create_board(
    body: CreateBoardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardSummary:
    conn = get_connection()
    try:
        user_id = get_user_id(conn, username)
        board_id = create_board_db(conn, user_id, body.name)
        conn.commit()
        return BoardSummary(id=board_id, name=body.name)
    finally:
        conn.close()


@router.patch("/{board_id}", response_model=BoardSummary)
def rename_board(
    board_id: str,
    body: RenameBoardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardSummary:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        rename_board_db(conn, board_id, body.name)
        conn.commit()
        return BoardSummary(id=board_id, name=body.name)
    finally:
        conn.close()


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> None:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        delete_board_db(conn, board_id)
        conn.commit()
    finally:
        conn.close()


@router.get("/{board_id}", response_model=BoardResponse)
def get_board(
    board_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.patch("/{board_id}/columns/{column_id}", response_model=BoardResponse)
def rename_column(
    board_id: str,
    column_id: str,
    body: RenameColumnRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        if not rename_column_db(conn, board_id, column_id, body.title):
            raise HTTPException(status_code=404, detail="Column not found")
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.post(
    "/{board_id}/columns/{column_id}/cards",
    response_model=BoardResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_card(
    board_id: str,
    column_id: str,
    body: AddCardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        card_id = add_card_db(conn, board_id, column_id, body.title, body.details)
        if card_id is None:
            raise HTTPException(status_code=404, detail="Column not found")
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.delete("/{board_id}/cards/{card_id}", response_model=BoardResponse)
def delete_card(
    board_id: str,
    card_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        if not delete_card_db(conn, board_id, card_id):
            raise HTTPException(status_code=404, detail="Card not found")
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.patch("/{board_id}/cards/{card_id}/move", response_model=BoardResponse)
def move_card(
    board_id: str,
    card_id: str,
    body: MoveCardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        if not card_belongs_to_board(conn, card_id, board_id):
            raise HTTPException(status_code=404, detail="Card not found")
        if not column_belongs_to_board(conn, body.column_id, board_id):
            raise HTTPException(status_code=404, detail="Target column not found")
        move_card_db(conn, board_id, card_id, body.column_id, body.index)
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.patch("/{board_id}/cards/{card_id}", response_model=BoardResponse)
def update_card(
    board_id: str,
    card_id: str,
    body: UpdateCardRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        fields = body.model_dump(exclude_unset=True)
        if not update_card_db(conn, board_id, card_id, fields):
            raise HTTPException(status_code=404, detail="Card not found")
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.put("/{board_id}/cards/{card_id}/labels", response_model=BoardResponse)
def set_card_labels(
    board_id: str,
    card_id: str,
    body: SetCardLabelsRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> BoardResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        if not set_labels_db(conn, board_id, card_id, body.label_names):
            raise HTTPException(status_code=404, detail="Card not found")
        conn.commit()
        return serialize_board(conn, board_id)
    finally:
        conn.close()


@router.get("/{board_id}/labels", response_model=list[Label])
def list_labels(
    board_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> list[Label]:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        rows = list_labels_db(conn, board_id)
        return [Label(id=row["id"], name=row["name"], color=row["color"]) for row in rows]
    finally:
        conn.close()


@router.get(
    "/{board_id}/cards/{card_id}/comments", response_model=list[CommentResponse]
)
def list_card_comments(
    board_id: str,
    card_id: str,
    username: Annotated[str, Depends(get_current_username)],
) -> list[CommentResponse]:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        rows = list_comments_db(conn, board_id, card_id)
        if rows is None:
            raise HTTPException(status_code=404, detail="Card not found")
        return [
            CommentResponse(
                id=row["id"],
                author=row["author"],
                body=row["body"],
                createdAt=row["created_at"],
            )
            for row in rows
        ]
    finally:
        conn.close()


@router.post(
    "/{board_id}/cards/{card_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_card_comment(
    board_id: str,
    card_id: str,
    body: AddCommentRequest,
    username: Annotated[str, Depends(get_current_username)],
) -> CommentResponse:
    conn = get_connection()
    try:
        require_board(conn, username, board_id)
        user_id = get_user_id(conn, username)
        comment_id = add_comment_db(conn, board_id, card_id, user_id, body.body)
        if comment_id is None:
            raise HTTPException(status_code=404, detail="Card not found")
        conn.commit()
        row = conn.execute(
            "SELECT created_at FROM comments WHERE id = ?", (comment_id,)
        ).fetchone()
        return CommentResponse(
            id=comment_id,
            author=username,
            body=body.body,
            createdAt=row["created_at"],
        )
    finally:
        conn.close()
