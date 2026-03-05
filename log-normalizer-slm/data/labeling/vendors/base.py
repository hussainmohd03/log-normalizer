"""Abstract base class for all vendor OCSF mappers."""

from abc import ABC, abstractmethod
from labeling.utils.clean import strip_nulls
from labeling.utils.timestamp import normalize_timestamp


# Hash algorithm name → OCSF algorithm_id
_HASH_ALGO_IDS = {
    "MD5": 1,
    "SHA-1": 2,
    "SHA-256": 3,
    "SHA-512": 4,
}

# Observable type string → type_id (OCSF 1.7.0 spec)
_OBSERVABLE_TYPE_IDS = {
    "Hostname": 1,
    "IP Address": 2,
    "MAC Address": 3,
    "Email Address": 4,
    "URL": 5,
    "File Name": 7,
    "Hash": 8,
    "Process Name": 9,
    "Resource UID": 10,
    "Endpoint": 20,
    "Domain": 28,
}

# OCSF fixed fields
_OCSF_BASE = {
    "activity_id": 1,
    "activity_name": "Create",
    "category_uid": 2,
    "category_name": "Findings",
    "class_uid": 2004,
    "class_name": "Detection Finding",
    "type_uid": 200401,
}


class BaseVendor(ABC):
    """Base class providing shared utilities for all vendor mappers."""

    @abstractmethod
    def map(self, raw_log: dict) -> dict:
        """
        Map a raw vendor log to an OCSF Detection Finding.

        Args:
            raw_log: The full raw log dict (including `source` and `alert` keys).

        Returns:
            An OCSF Detection Finding dict with nulls stripped.
        """

    def _base_ocsf(self) -> dict:
        """Return a copy of the OCSF fixed fields."""
        return dict(_OCSF_BASE)

    def _finalize(self, ocsf: dict) -> dict:
        """Strip nulls and return the final OCSF output."""
        return strip_nulls(ocsf)

    @staticmethod
    def normalize_timestamp(ts) -> str:
        return normalize_timestamp(ts)

    @staticmethod
    def build_hash(algorithm: str, value: str) -> dict:
        """Build an OCSF hash object. Returns empty dict if value is blank or all-zeros."""
        if not value or not value.strip():
            return {}
        v = value.strip()
        if all(c in "0" for c in v.replace("-", "")):
            return {}
        algo_id = _HASH_ALGO_IDS.get(algorithm, 0)
        return {"algorithm": algorithm, "algorithm_id": algo_id, "value": v}

    @staticmethod
    def build_observable(name: str, type_str: str, value: str) -> dict:
        """Build an OCSF observable object."""
        if not value or not str(value).strip():
            return {}
        type_id = _OBSERVABLE_TYPE_IDS.get(type_str, 0)
        return {"name": name, "type": type_str, "type_id": type_id, "value": str(value).strip()}

    @staticmethod
    def safe_int(value) -> int | None:
        """Cast to int; return None on failure."""
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def first_nonempty(values: list):
        """Return the first non-null, non-empty value from a list."""
        for v in values:
            if v is not None and v != "" and v != [] and v != {}:
                return v
        return None
