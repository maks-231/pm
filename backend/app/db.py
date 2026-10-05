import sqlite3
from pathlib import Path

from app.auth import HARDCODED_PASSWORD, HARDCODED_USERNAME, hash_password

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

CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    UNIQUE (board_id, name)
);

CREATE TABLE IF NOT EXISTS card_labels (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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
    """Open a connection, guaranteeing the schema, migrations, and seed data exist.

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
    _migrate_schema(conn)
    _seed(conn)
    return conn


def _add_column_if_missing(
    conn: sqlite3.Connection, table: str, column: str, column_def: str
) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")


def _drop_boards_user_id_unique(conn: sqlite3.Connection) -> None:
    """Multiple boards per user: boards.user_id was UNIQUE in the original
    (Part 5) schema. Rebuild the table without that constraint, once."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'boards'"
    ).fetchone()
    if row is None or "UNIQUE" not in row["sql"]:
        return
    conn.executescript(
        """
        CREATE TABLE boards_new (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL DEFAULT 'Board',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        INSERT INTO boards_new (id, user_id, name, created_at)
            SELECT id, user_id, name, created_at FROM boards;
        DROP TABLE boards;
        ALTER TABLE boards_new RENAME TO boards;
        """
    )


def _migrate_schema(conn: sqlite3.Connection) -> None:
    _add_column_if_missing(conn, "boards", "name", "name TEXT NOT NULL DEFAULT 'Board'")
    _drop_boards_user_id_unique(conn)
    _add_column_if_missing(conn, "cards", "due_date", "due_date TEXT")
    _add_column_if_missing(conn, "cards", "assignee_text", "assignee_text TEXT")
    conn.commit()


def _seed(conn: sqlite3.Connection) -> None:
    """Create the hardcoded demo user and its demo board, but only at the
    moment the user row itself is first created. Seeding based on "does
    this user currently have zero boards" would fight the delete-board
    feature (Part 12): deleting your last board must leave zero boards,
    not resurrect the demo data on the next request."""
    user_row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (HARDCODED_USERNAME,)
    ).fetchone()
    if user_row is not None:
        return

    password_hash = hash_password(HARDCODED_PASSWORD)
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (HARDCODED_USERNAME, password_hash),
    )
    user_id = cursor.lastrowid

    board_id = f"board-{user_id}"
    conn.execute(
        "INSERT INTO boards (id, user_id, name) VALUES (?, ?, ?)",
        (board_id, user_id, "Board 1"),
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
