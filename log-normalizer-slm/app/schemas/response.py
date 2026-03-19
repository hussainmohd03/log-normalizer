"""
Response schema for the normalize endpoint.

This is the contract that NestJS depends on. Changes to this
shape are breaking changes.

Handles both success and partial failure in one model:
  Success: ocsf={...}, confidence=0.91, error=None
  Failure: ocsf={},    confidence=0.0,  error="JSON extraction failed: ..."

Partial failures go to the manual review queue. NestJS sees confidence=0.0 and routes accordingly.
"""

from typing import Any, Optional

from pydantic import BaseModel, field_validator


class NormalizeResponse(BaseModel):

    ocsf: dict[str, Any]
    confidence: float
    processing_time_ms: int
    decision: str
    breakdown: Optional[dict[str, float]] = None
    errors: Optional[list[str]] = None
    error: Optional[str] = None

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))  