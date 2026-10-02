from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from fastapi.staticfiles import StaticFiles

from app.ai import router as ai_router
from app.auth import (
    COOKIE_NAME,
    HARDCODED_PASSWORD,
    HARDCODED_USERNAME,
    LoginRequest,
    SessionResponse,
    create_session,
    end_session,
    get_current_username,
)
from app.board import router as board_router

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# Docker injects .env via docker-compose's env_file, but local/test runs
# (uv run uvicorn, uv run pytest) don't go through Docker, so load it here.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

app = FastAPI(title="Project Management MVP")


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.post("/api/login", response_model=SessionResponse)
def login(credentials: LoginRequest, response: Response) -> SessionResponse:
    if (
        credentials.username != HARDCODED_USERNAME
        or credentials.password != HARDCODED_PASSWORD
    ):
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
