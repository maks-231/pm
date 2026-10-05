import secrets

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from fastapi import Cookie, HTTPException, status
from pydantic import BaseModel, Field

HARDCODED_USERNAME = "user"
HARDCODED_PASSWORD = "password"
COOKIE_NAME = "session_token"

# In-memory session store: fine for a single-process MVP that's meant to run
# locally. Sessions are lost on restart; the user just logs in again.
_sessions: dict[str, str] = {}

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (Argon2Error, ValueError):
        # Argon2Error covers a wrong password (VerifyMismatchError).
        # InvalidHashError — raised when the hash isn't valid Argon2 at
        # all, e.g. a row seeded by an older version of this app before
        # Part 11's hashing change — is a ValueError, not an Argon2Error.
        # Either way, the credentials don't verify; this must not be an
        # unhandled 500.
        return False


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=200)


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
