import secrets

from fastapi import Cookie, HTTPException, status
from pydantic import BaseModel

HARDCODED_USERNAME = "user"
HARDCODED_PASSWORD = "password"
COOKIE_NAME = "session_token"

# In-memory session store: fine for a single-process MVP that's meant to run
# locally. Sessions are lost on restart; the user just logs in again.
_sessions: dict[str, str] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    username: str


def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = username
    return token


def end_session(token: str | None) -> None:
    if token is not None:
        _sessions.pop(token, None)


def get_current_username(
    session_token: str | None = Cookie(default=None),
) -> str:
    username = _sessions.get(session_token) if session_token else None
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return username
