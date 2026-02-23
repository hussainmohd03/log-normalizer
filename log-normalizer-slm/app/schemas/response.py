"""
Response schema for the normalize endpoint.

This is the contract that NestJS depends on in Phase 4. Changes to this
shape are breaking changes.

Handles both success and partial failure in one model:
  Success: ocsf={...}, confidence=0.91, error=None
  Failure: ocsf={},    confidence=0.0,  error="JSON extraction failed: ..."

Partial failures are NOT HTTP errors — they are routable events that go
to the manual review queue. NestJS sees confidence=0.0 and routes accordingly.
"""

from typing import Any, Optional

from pydantic import BaseModel, field_validator


class NormalizeResponse(BaseModel):
    """What the normalize endpoint returns — always 200 OK for both
    success and partial failure."""

    ocsf: dict[str, Any]
    confidence: float
    processing_time_ms: int
    error: Optional[str] = None
    rag_examples_used: int = 0

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        """Enforce 0.0–1.0 range. The scorer can theoretically return
        values slightly outside due to floating-point arithmetic."""
        return max(0.0, min(1.0, float(v)))
