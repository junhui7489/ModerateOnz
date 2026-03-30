from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # Database — Railway provides DATABASE_URL as postgres://
    # We convert it to postgresql+asyncpg:// for SQLAlchemy
    database_url: str = "postgresql+asyncpg://moderation:moderation_secret@db:5432/moderation_db"

    # Redis — Railway provides REDIS_URL
    redis_url: str = "redis://redis:6379/0"

    # Celery — derived from redis_url if not set
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    # API Keys
    openai_api_key: str = ""

    # Upload
    upload_dir: str = "/app/uploads"
    max_upload_size_mb: int = 10

    # CORS — comma-separated origins for production
    frontend_url: str = "http://localhost:5173"

    # Server
    port: int = 8000

    # Auth
    secret_key: str = "change-this-to-a-random-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Crawler — YouTube (Data API v3)
    youtube_api_key: str = ""
    youtube_video_ids: str = ""  # comma-separated video IDs
    youtube_search_queries: str = ""  # comma-separated — finds videos then crawls comments
    youtube_max_comments: int = 50

    # Crawler — general
    crawler_interval_minutes: int = 30

    @field_validator("database_url")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        # Railway gives postgres:// — SQLAlchemy async needs postgresql+asyncpg://
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    def get_cors_origins(self) -> list[str]:
        """Split comma-separated frontend_url into a list of origins."""
        origins = [o.strip() for o in self.frontend_url.split(",") if o.strip()]
        # Always allow localhost for dev
        if "http://localhost:5173" not in origins:
            origins.append("http://localhost:5173")
        return origins

    def get_celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    def get_celery_backend(self) -> str:
        if self.celery_result_backend:
            return self.celery_result_backend
        # Use redis DB 1 for results
        base = self.redis_url.rstrip("/")
        if base.endswith("/0"):
            return base[:-1] + "1"
        return base + "/1"

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
