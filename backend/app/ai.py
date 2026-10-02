import os
from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_username

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
PING_PROMPT = "What is 2+2? Answer with only the number."

router = APIRouter(prefix="/api/ai", tags=["ai"])


class PingResponse(BaseModel):
    reply: str


@router.post("/ping", response_model=PingResponse)
def ping(
    _username: Annotated[str, Depends(get_current_username)],
) -> PingResponse:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured",
        )

    model = os.environ.get("CHAT_MODEL") or DEFAULT_MODEL
    client = anthropic.Anthropic(api_key=api_key)

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
