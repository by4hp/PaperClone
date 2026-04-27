from ..config import settings
from .base import LLMClient
from .claude import ClaudeClient
from .deepseek import DeepSeekClient
from .gemini_kie import GeminiKieClient
from .mock import MockClient


# UI-facing model IDs → (provider, api_model_string)
# The api_model_string is what gets sent to the provider API.
MODEL_REGISTRY: dict[str, tuple[str, str]] = {
    "gemini-3.1-pro": ("gemini_kie", "gemini-3.1-pro"),
    "deepseek-v4-flash": ("deepseek", "deepseek-v4-flash"),
    "deepseek-v4-pro": ("deepseek", "deepseek-v4-pro"),
}


def get_llm_client(model: str | None = None) -> LLMClient:
    """Resolve a client by UI model id, or fall back to env-configured provider."""
    if model and model in MODEL_REGISTRY:
        provider, api_model = MODEL_REGISTRY[model]
        if provider == "claude":
            return ClaudeClient()
        if provider == "gemini_kie":
            return GeminiKieClient()
        if provider == "deepseek":
            return DeepSeekClient(api_model)

    provider = settings.llm_provider
    if provider == "mock":
        return MockClient()
    if provider == "gemini_kie":
        return GeminiKieClient()
    if provider == "claude":
        return ClaudeClient()
    if provider == "deepseek":
        # Default to flash for generation (fast, no thinking). The extract
        # step pins itself to pro explicitly.
        return DeepSeekClient("deepseek-v4-flash")
    raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
