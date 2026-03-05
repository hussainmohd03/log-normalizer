"""Vendor severity normalization helpers."""

# OCSF severity_id labels
_SEVERITY_LABELS = {
    0: "Unknown",
    1: "Informational",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Critical",
    99: "Other",
}


def severity_label(severity_id: int) -> str:
    return _SEVERITY_LABELS.get(severity_id, "Unknown")


def map_crowdstrike_severity(value) -> tuple:
    """CrowdStrike: 0-100 numeric scale."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return 0, "Unknown"
    if v <= 19:
        return 1, "Informational"
    if v <= 39:
        return 2, "Low"
    if v <= 59:
        return 3, "Medium"
    if v <= 79:
        return 4, "High"
    return 5, "Critical"


def map_string_severity(value) -> tuple:
    """
    Generic string-based mapping used by: Splunk (urgency/severity),
    Palo Alto, Microsoft Defender, Trend Micro, Sentinel, Expel.
    """
    if value is None:
        return 0, "Unknown"
    v = str(value).strip().lower()
    mapping = {
        "informational": (1, "Informational"),
        "info": (1, "Informational"),
        "low": (2, "Low"),
        "medium": (3, "Medium"),
        "high": (4, "High"),
        "critical": (5, "Critical"),
    }
    return mapping.get(v, (0, "Unknown"))


def map_logrhythm_severity(rbp_max) -> tuple:
    """LogRhythm: rbpMax 0-100. Spec: 0-39=Low, 40-64=Medium, 65-100=High."""
    try:
        v = int(rbp_max)
    except (TypeError, ValueError):
        return 0, "Unknown"
    if v <= 39:
        return 2, "Low"
    if v <= 64:
        return 3, "Medium"
    return 4, "High"
