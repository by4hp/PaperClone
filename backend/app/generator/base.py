from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class LLMUsage:
    """Per-call token accounting. Fields are best-effort — a provider that
    doesn't expose cache stats simply leaves them as None / 0."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0  # cache-hit input tokens
    model: Optional[str] = None


# Module-level slot the generator sets after each LLM call so the
# pipeline can pull usage stats out without changing the LLMClient
# signature. Single-process usage; do not rely on it under threads.
last_usage: LLMUsage = LLMUsage()


class LLMClient(Protocol):
    async def complete(
        self,
        messages: list[Message],
        *,
        reasoning_effort: str = "high",
        temperature: float | None = None,
    ) -> str:
        ...
