from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from fastapi.staticfiles import StaticFiles

from app.ai import router as ai_router
from app.auth import (
    COOKIE_NAME,
    LoginRequest,
    SessionResponse,
    SignupRequest,
    create_session,
    end_session,
    get_current_username,
    hash_password,
    verify_password,
)
from app.board import create_board_db, router as board_router
from app.db import get_connection

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# Docker injects .env via docker-compose's env_file, but local/test runs
# (uv run uvicorn, uv run pytest) don't go through Docker, so load it here.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

app = FastAPI(title="Project Management MVP")


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.post("/api/signup", response_model=SessionResponse)
def signup(credentials: SignupRequest, response: Response) -> SessionResponse:
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT 1 FROM users WHERE username = ?", (credentials.username,)
        ).fetchone()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

        cursor = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (credentials.username, hash_password(credentials.password)),
        )
        user_id = cursor.lastrowid
        create_board_db(conn, user_id, "Board 1")
        conn.commit()
    finally:
        conn.close()

    token = create_session(credentials.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
    )
    return SessionResponse(username=credentials.username)


@app.post("/api/login", response_model=SessionResponse)
def login(credentials: LoginRequest, response: Response) -> SessionResponse:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = ?",
            (credentials.username,),
        ).fetchone()
    finally:
        conn.close()

    if row is None or not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_session(credentials.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
    )
    return SessionResponse(username=credentials.username)


@app.post("/api/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session_token: Annotated[str | None, Cookie()] = None,
) -> None:
    end_session(session_token)
    response.delete_cookie(COOKIE_NAME)


@app.get("/api/session", response_model=SessionResponse)
def session(
    username: Annotated[str, Depends(get_current_username)],
) -> SessionResponse:
    return SessionResponse(username=username)


app.include_router(board_router)
app.include_router(ai_router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
