"""
Application configuration.

reads from .env file, falls back to defaults.

"""

from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # -- Model settings ---------
    base_model_path: str = "DeepHat/DeepHat-V1-7B"
    adapter_path: str = "./models/deephat-finetuned" 
    device: str = "auto"
    temperature: float = 0.1
    max_new_tokens: int = 2048

    # -- Confidence settings --------- 
    confidence_threshold: float = 0.85

    # -- RAG settings  ---------
    chroma_path: str = "./data/chroma"
    rag_examples_count: int = 2

    # -- App settings ---------
    log_level: str = "INFO"

    # -- Validators ---------

    @field_validator("temperature")
    @classmethod
    def clamp_temperature(cls, v: float) -> float:
        """Temperature must be 0.0–1.0. Clamp rather than reject so a
        typo like 2.0 doesn't crash the whole service on startup."""
        return max(0.0, min(1.0, v))

    @field_validator("confidence_threshold")
    @classmethod
    def clamp_confidence_threshold(cls, v: float) -> float:
        """Confidence threshold must be 0.0–1.0."""
        return max(0.0, min(1.0, v))


# instance to import 
settings = Settings()
