"""Source-string to vendor name lookup. Used by Rule 11 to fill in
metadata.product.vendor_name when the LLM omits it or sets it to
"Unknown". Keys are the source strings as they actually appear in
NormalizeRequest.source from the ingestion endpoint.
"""

from typing import Optional


VENDOR_MAP: dict[str, str] = {
    "splunk": "Splunk",
    "crowdstrike": "CrowdStrike",
    "microsoft": "Microsoft",          # Microsoft Defender
    "sentinel": "Microsoft",           # Azure Sentinel is a Microsoft product
    "paloalto": "Palo Alto Networks",
    "trendmicro": "Trend Micro",
    "logrhythm": "LogRhythm",
    "expel": "Expel",
}


def lookup_vendor(source: str) -> Optional[str]:
    """Resolve a source string to its canonical vendor name.

    Returns None for unknown sources so the caller can leave the field
    untouched rather than guessing.
    """
    if not source:
        return None
    return VENDOR_MAP.get(source.strip().lower())
