import hashlib
import sqlite3
from pathlib import Path

from app.auth import HARDCODED_PASSWORD, HARDCODED_USERNAME

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (board_id, position)
);

CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    UNIQUE (column_id, position)
);
"""

# Mirrors frontend/src/lib/kanban.ts's initialData, so the first login looks
# the same as the old client-only demo.
SEED_COLUMNS = [
    (
        "col-backlog",
        "Backlog",
        [
            (
                "card-1",
                "Align roadmap themes",
                "Draft quarterly themes with impact statements and metrics.",
            ),
            (
                "card-2",
                "Gather customer signals",
                "Review support tags, sales notes, and churn feedback.",
            ),
        ],
    ),
    (
        "col-discovery",
        "Discovery",
        [
            (
                "card-3",
                "Prototype analytics view",
                "Sketch initial dashboard layout and key drill-downs.",
            ),
        ],
    ),
    (
        "col-progress",
        "In Progress",
        [
            (
                "card-4",
                "Refine status language",
                "Standardize column labels and tone across the board.",
            ),
            (
                "card-5",
                "Design card layout",
                "Add hierarchy and spacing for scanning dense lists.",
            ),
        ],
    ),
    (
        "col-review",
        "Review",
        [
            (
                "card-6",
                "QA micro-interactions",
                "Verify hover, focus, and loading states.",
            ),
        ],
    ),
    (
        "col-done",
        "Done",
        [
            (
                "card-7",
                "Ship marketing page",
                "Final copy approved and asset pack delivered.",
            ),
            (
                "card-8",
                "Close onboarding sprint",
                "Document release notes and share internally.",
            ),
        ],
    ),
]


def get_connection() -> sqlite3.Connection:
    """Open a connection, guaranteeing the schema and seed data exist.

    Deliberately not a FastAPI startup hook: the checks below are cheap,
    idempotent (CREATE TABLE IF NOT EXISTS plus a couple of indexed SELECTs),
    and running them on every connection means the DB is always ready
    regardless of how the app is booted (uvicorn, a test client that skips
    lifespan events, a one-off script) without needing a second code path.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    _seed(conn)
    return conn


def _seed(conn: sqlite3.Connection) -> None:
    user_row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (HARDCODED_USERNAME,)
    ).fetchone()
    if user_row is None:
        password_hash = hashlib.sha256(HARDCODED_PASSWORD.encode()).hexdigest()
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (HARDCODED_USERNAME, password_hash),
        )
        user_id = cursor.lastrowid
    else:
        user_id = user_row["id"]

    board_row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    if board_row is not None:
        conn.commit()
        return

    board_id = f"board-{user_id}"
    conn.execute(
        "INSERT INTO boards (id, user_id) VALUES (?, ?)", (board_id, user_id)
    )
    for position, (column_id, title, cards) in enumerate(SEED_COLUMNS):
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column_id, board_id, title, position),
        )
        for card_position, (card_id, card_title, details) in enumerate(cards):
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position) "
                "VALUES (?, ?, ?, ?, ?)",
                (card_id, column_id, card_title, details, card_position),
            )
    conn.commit()
