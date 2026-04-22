from __future__ import annotations

import httpx

from ..config import settings
from .base import Message


class GeminiKieClient:
    """OpenAI-compatible client for kie.ai Gemini 3.1 Pro."""

    def __init__(self) -> None:
        if not settings.kie_api_key:
            raise RuntimeError("KIE_API_KEY is not configured")
        self._endpoint = f"{settings.kie_base_url.rstrip('/')}/chat/completions"
        self._headers = {
            "Authorization": f"Bearer {settings.kie_api_key}",
            "Content-Type": "application/json",
        }

    async def complete(
        self,
        messages: list[Message],
        *,
        reasoning_effort: str = "high",
        temperature: float | None = None,
    ) -> str:
        payload: dict = {
            "model": settings.kie_model,
            "messages": [
                {"role": m.role, "content": [{"type": "text", "text": m.content}]}
                for m in messages
            ],
            "stream": False,
            "include_thoughts": False,
            "reasoning_effort": reasoning_effort,
        }
        if temperature is not None:
            payload["temperature"] = temperature

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            resp = await client.post(self._endpoint, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # kie.ai returns 200 with an inner {"code": 4xx, "msg": "...", "data": null}
        # for credit/auth/rate errors. Surface msg directly.
        if data.get("data") is None and data.get("msg"):
            code = data.get("code")
            if code == 402:
                raise RuntimeError("kie.ai 账户额度不足，请充值后重试")
            raise RuntimeError(f"kie.ai 错误（{code}）：{data['msg']}")

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"kie.ai 返回空响应：{data}")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            return "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        return content or ""
