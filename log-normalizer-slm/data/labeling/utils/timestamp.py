"""Timestamp normalization utilities."""

import datetime
import logging
import re

_EXCESS_FRAC_RE = re.compile(r"(\.\d{6})\d+")

logger = logging.getLogger(__name__)

# Threshold: epoch values above this (year ~2001) are treated as milliseconds
_MS_THRESHOLD = 1_000_000_000_000


def normalize_timestamp(ts) -> str:
    """
    Convert any timestamp representation to ISO 8601 UTC string.

    Handles:
    - ISO 8601 strings (with or without timezone, with or without microseconds)
    - Unix epoch seconds (int or float)
    - Unix epoch milliseconds (int or float > _MS_THRESHOLD)
    - MongoDB extended JSON: {"$numberLong": "1234567890000"}
    - None → current UTC time (with warning)
    """
    if ts is None:
        logger.warning("Timestamp is None; using current UTC time")
        return _now_iso()

    # MongoDB $numberLong
    if isinstance(ts, dict):
        raw = ts.get("$numberLong") or ts.get("$date")
        if raw is not None:
            return normalize_timestamp(int(raw))
        logger.warning("Unknown dict timestamp format %r; using current UTC time", ts)
        return _now_iso()

    # Numeric epoch
    if isinstance(ts, (int, float)):
        if ts > _MS_THRESHOLD:
            # milliseconds
            dt = datetime.datetime.utcfromtimestamp(ts / 1000.0)
        else:
            dt = datetime.datetime.utcfromtimestamp(ts)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # String
    if isinstance(ts, str):
        ts = ts.strip()
        if not ts:
            logger.warning("Empty timestamp string; using current UTC time")
            return _now_iso()

        # Try numeric string
        try:
            numeric = float(ts)
            return normalize_timestamp(numeric)
        except ValueError:
            pass

        # Truncate fractional seconds beyond 6 digits (Python %f limit)
        ts = _EXCESS_FRAC_RE.sub(r"\1", ts)

        # Try parsing ISO-like strings
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%fZ",    
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z",
        ):
            try:
                dt = datetime.datetime.strptime(ts, fmt)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                continue

        # Fallback: try dateutil if available
        try:
            from dateutil import parser as du_parser
            dt = du_parser.parse(ts)
            if dt.tzinfo is not None:
                dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass

        logger.warning("Could not parse timestamp %r; using current UTC time", ts)
        return _now_iso()

    logger.warning("Unrecognized timestamp type %r; using current UTC time", type(ts))
    return _now_iso()


def _now_iso() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
