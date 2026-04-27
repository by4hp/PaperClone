from __future__ import annotations

import httpx

from ..config import settings
from . import base as _base
from .base import LLMUsage, Message


class DeepSeekClient:
    """OpenAI-compatible client for DeepSeek API (chat completions)."""

    def __init__(self, model: str) -> None:
        if not settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        self._model = model
        self._endpoint = f"{settings.deepseek_base_url.rstrip('/')}/chat/completions"
        self._headers = {
            "Authorization": f"Bearer {settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }

    async def complete(
        self,
        messages: list[Message],
        *,
        reasoning_effort: str = "high",
        temperature: float | None = None,
    ) -> str:
        # DeepSeek V4 supports 384K output tokens, but thinking-mode tokens
        # count against max_tokens. Flash skips thinking for raw speed; Pro
        # keeps thinking on for quality and gets a larger budget for it.
        flash = self._model == "deepseek-v4-flash"
        payload: dict = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "max_tokens": 131072,
            "thinking": {"type": "disabled" if flash else "enabled"},
        }
        # Per DeepSeek docs, reasoning_effort is a TOP-LEVEL field (not
        # nested inside `thinking`). Only meaningful when thinking is on.
        if not flash:
            payload["reasoning_effort"] = reasoning_effort
        if temperature is not None:
            payload["temperature"] = temperature

        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
            resp = await client.post(self._endpoint, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        usage = data.get("usage") or {}
        _base.last_usage = LLMUsage(
            prompt_tokens=usage.get("prompt_tokens", 0) or 0,
            completion_tokens=usage.get("completion_tokens", 0) or 0,
            # DeepSeek returns this when prefix cache hits; 0 means full miss.
            cached_tokens=usage.get("prompt_cache_hit_tokens", 0) or 0,
            model=self._model,
        )

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"DeepSeek 返回空响应：{data}")
        choice = choices[0]
        finish_reason = choice.get("finish_reason")
        message = choice.get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            text = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        else:
            text = content or ""
        if finish_reason == "length":
            from datetime import datetime
            debug_dir = settings.output_dir.parent / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            dump_path = debug_dir / f"deepseek_truncated_{stamp}.txt"
            dump_path.write_text(text, encoding="utf-8")
            raise RuntimeError(
                f"DeepSeek 输出被 max_tokens 截断（finish_reason=length，已输出 {len(text)} 字，"
                f"落盘于 {dump_path.name}），请减少素材量或换更大上下文的模型"
            )
        return text
