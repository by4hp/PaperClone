from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "gemini_kie"

    kie_api_key: str = ""
    kie_base_url: str = "https://api.kie.ai/gemini-3.1-pro/v1"
    kie_model: str = "gemini-3.1-pro"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-7"

    upload_dir: Path = Path("./storage/uploads")
    output_dir: Path = Path("./storage/outputs")
    job_store_path: Path = Path("./storage/jobs.json")

    frontend_origin: str = "http://localhost:3000"

    # Days of inactivity before a job (and its PDF) is garbage-collected.
    # "Inactivity" = time since last access via GET /api/jobs/{id} or download.
    job_ttl_days: int = 7
    upload_ttl_days: int = 3
    cleanup_interval_seconds: int = 3600


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)
settings.job_store_path.parent.mkdir(parents=True, exist_ok=True)
