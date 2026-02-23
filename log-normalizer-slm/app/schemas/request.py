"""
Request schema for the normalize endpoint.

FastAPI uses this for automatic validation — invalid requests are rejected
with a 422 before your endpoint code runs.
"""

import re
from enum import Enum

from pydantic import BaseModel, field_validator


class LogFormat(str, Enum):
    """Known log formats. Lowercase-normalized.

    Using an Enum means FastAPI returns a clear validation error for unknown
    values instead of silently accepting typos like "jsn" or "CEF".
    """

    JSON = "json"
    CEF = "cef"
    SYSLOG = "syslog"
    CSV = "csv"
    LEEF = "leef"
    UNKNOWN = "unknown"


class NormalizeRequest(BaseModel):
    """What the normalize endpoint accepts."""

    raw_log: str
    source: str
    format: LogFormat = LogFormat.UNKNOWN

    @field_validator("raw_log")
    @classmethod
    def raw_log_not_empty_and_bounded(cls, v: str) -> str:
        """Must be non-empty and under 10K chars.

        A single log over 10K chars indicates something is wrong — multiline
        batch, binary content, base64 blob, etc. Reject early rather than
        waste model inference on garbage input.
        """
        stripped = v.strip()
        if not stripped:
            raise ValueError("raw_log must not be empty")
        if len(stripped) > 10_000:
            raise ValueError(
                f"raw_log too long ({len(stripped)} chars). "
                "Max 10,000 chars for a single log entry."
            )
        return stripped

    @field_validator("source")
    @classmethod
    def source_is_safe(cls, v: str) -> str:
        """Source is used directly in the prompt. Reject characters that
        could break prompt formatting or enable injection.

        Allowed: lowercase letters, digits, hyphens.
        Examples: "palo-alto", "crowdstrike", "windows-events"
        """
        cleaned = v.strip().lower()
        if not cleaned:
            raise ValueError("source must not be empty")
        if not re.match(r"^[a-z0-9][a-z0-9\-]*[a-z0-9]$|^[a-z0-9]$", cleaned):
            raise ValueError(
                f"source must be lowercase alphanumeric with hyphens only, "
                f"got: {v!r}"
            )
        return cleaned

    @field_validator("format", mode="before")
    @classmethod
    def normalize_format_case(cls, v: str) -> str:
        """Accept "CEF", "Cef", "cef" — normalize to lowercase before
        Enum validation kicks in."""
        if isinstance(v, str):
            return v.strip().lower()
        return v
