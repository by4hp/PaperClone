from ..config import settings
from .base import LLMClient
from .claude import ClaudeClient
from .gemini_kie import GeminiKieClient
from .mock import MockClient


def get_llm_client() -> LLMClient:
    provider = settings.llm_provider
    if provider == "mock":
        return MockClient()
    if provider == "gemini_kie":
        return GeminiKieClient()
    if provider == "claude":
        return ClaudeClient()
    raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
