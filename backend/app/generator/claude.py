from __future__ import annotations

import httpx

from ..config import settings
from . import base as _base
from .base import LLMUsage, Message


class ClaudeClient:
    """Direct Anthropic Messages API client (swappable fallback)."""

    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        self._endpoint = "https://api.anthropic.com/v1/messages"
        self._headers = {
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    async def complete(
        self,
        messages: list[Message],
        *,
        reasoning_effort: str = "high",
        temperature: float | None = None,
    ) -> str:
        system_parts = [m.content for m in messages if m.role == "system"]
        user_asst = [m for m in messages if m.role != "system"]

        payload: dict = {
            "model": settings.anthropic_model,
            "max_tokens": 8192,
            "messages": [{"role": m.role, "content": m.content} for m in user_asst],
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if temperature is not None:
            payload["temperature"] = temperature

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            resp = await client.post(self._endpoint, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        usage = data.get("usage") or {}
        # Claude returns cache_read_input_tokens / cache_creation_input_tokens
        # when explicit cache_control is set on a block; without it they stay 0.
        _base.last_usage = LLMUsage(
            prompt_tokens=usage.get("input_tokens", 0) or 0,
            completion_tokens=usage.get("output_tokens", 0) or 0,
            cached_tokens=usage.get("cache_read_input_tokens", 0) or 0,
            model=settings.anthropic_model,
        )

        blocks = data.get("content") or []
        return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
