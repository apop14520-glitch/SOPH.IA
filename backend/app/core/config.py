from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SOPH.IA"
    environment: str = "development"
    secret_key: str = "troque-esta-chave"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///./data/sophia.db"
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "./uploads"
    ai_provider: str = "template"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"
    web_search_enabled: bool = True
    ollama_api_key: str = ""
    web_allowed_domains: str = "gov.br,planalto.gov.br,tcu.gov.br,cgu.gov.br,compras.gov.br,rondonia.ro.gov.br"
    web_search_max_results: int = 4
    web_search_timeout_seconds: int = 20
    seed_admin_email: str = "admin@sophia.ro.gov.br"
    seed_admin_password: str = ""
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    def ensure_dirs(self) -> None:
        Path(self.upload_dir).mkdir(parents=True, exist_ok=True)
        if self.database_url.startswith("sqlite"):
            Path("./data").mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
