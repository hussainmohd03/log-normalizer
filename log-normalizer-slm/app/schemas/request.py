"""
Request schema for the normalize endpoint.
"""

import re
from enum import Enum

from pydantic import BaseModel, field_validator


class LogFormat(str, Enum):

    JSON = "json"
    CEF = "cef"
    SYSLOG = "syslog"
    CSV = "csv"
    LEEF = "leef"
    UNKNOWN = "unknown"


class NormalizeRequest(BaseModel):

    raw_log: str
    source: str
    format: LogFormat = LogFormat.UNKNOWN

    @field_validator("raw_log")
    @classmethod
    def raw_log_not_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("raw_log must not be empty")

        return stripped

    @field_validator("source")
    @classmethod
    def source_is_safe(cls, v: str) -> str:
        """Source is used directly in the prompt. Reject characters that
        could break prompt formatting or enable injection.

        Allowed: lowercase letters, digits, hyphens.
        Examples: "palo-alto", "crowdstrike", "microsoft"
        """
        cleaned = v.strip().lower()
        if not cleaned:
            raise ValueError("source must not be empty")
        if not re.match(r"^[a-z0-9][a-z0-9\-]*[a-z0-9]$|^[a-z0-9]$", cleaned):
            raise ValueError(
                f"source must be lowercase alphanumeric with hyphens only, "
                f"got: {v!r}")
        return cleaned

    @field_validator("format", mode="before")
    @classmethod
    def normalize_format_case(cls, v: str) -> str:
        """Accept "CEF", "Cef", "cef" — normalize to lowercase before
        Enum validation kicks in."""
        if isinstance(v, str):
            return v.strip().lower()
        return v
