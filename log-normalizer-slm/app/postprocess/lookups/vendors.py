from typing import Optional


VENDOR_MAP: dict[str, str] = {
    "splunk": "Splunk",
    "crowdstrike": "CrowdStrike",
    "microsoft": "Microsoft",
    "sentinel": "Microsoft",
    "paloalto": "Palo Alto Networks",
    "trendmicro": "Trend Micro",
    "logrhythm": "LogRhythm",
    "expel": "Expel",
}


def lookup_vendor(source: str) -> Optional[str]:
    if not source:
        return None
    return VENDOR_MAP.get(source.strip().lower())
