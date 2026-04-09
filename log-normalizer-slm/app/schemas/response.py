from typing import Any, Optional

from pydantic import BaseModel, field_validator


class NormalizeResponse(BaseModel):
    ocsf: dict[str, Any] | None
    confidence: float
    processing_time_ms: int
    decision: str
    breakdown: Optional[dict[str, float]] = None
    validation_errors: Optional[list[str]] = None
    error: Optional[str] = None
    fixes_applied: list[str] = []
    hallucinations_stripped: list[str] = []

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))
