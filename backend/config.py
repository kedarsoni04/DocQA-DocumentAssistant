"""
Application configuration — reads from .env file.
All secrets are read here; never hardcode keys anywhere else.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API Key for Generation via Groq
    groq_api_key: str

    # API Key for Embeddings via Voyage AI
    voyage_api_key: str

    # Storage paths (relative to backend dir, created on startup)
    upload_dir: str = "uploads"
    chroma_persist_dir: str = "chroma_db"

    # Model config
    # voyage-4-lite: 1024-dim vectors, cost-efficient free-tier usage
    # voyage-4 or voyage-4-large: higher retrieval quality, same vector space
    embedding_model: str = "voyage-4-lite"
    generation_model: str = "qwen/qwen3.8-27b"
    generation_temperature: float = 0.1
    retrieval_k: int = 7

    # Chroma collection name — wiped on each new upload (single-doc phase)
    chroma_collection: str = "doc_chunks"


settings = Settings()
