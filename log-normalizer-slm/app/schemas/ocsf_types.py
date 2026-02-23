"""
OCSF schema constants.

Pure reference data from the OCSF specification. No business logic.
Both confidence_scorer.py and the validation layer import from here.

Update this file when targeting a new OCSF version.
Verify values against: https://schema.ocsf.io/

"""

# ── Valid OCSF Event Class UIDs ─────────────────────────────────────────
# Frozen set signals these are constant, not mutable at runtime.
# Maps class_uid → class_name for the event classes we support.

VALID_CLASS_UIDS: dict[int, str] = {
    # System Activity (category_uid 1)
    1001: "File System Activity",
    1007: "Process Activity",

    # Findings (category_uid 2)
    2001: "Security Finding",
    2004: "Detection Finding",

    # Identity & Access Management (category_uid 3)
    3002: "Authentication",
    3003: "Authorize Session",
    
    # Network Activity (category_uid 4)
    4001: "Network Activity",
    4002: "HTTP Activity",
    4003: "DNS Activity",
    4004: "DHCP Activity",
    4006: "SSH Activity",
}

VALID_CLASS_UID_SET: frozenset[int] = frozenset(VALID_CLASS_UIDS.keys())


# ── Severity IDs ────────────────────────────────────────────────────────
# OCSF severity_id enum — applies to all event classes.

SEVERITY_IDS: dict[int, str] = {
    0: "Unknown",
    1: "Informational",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Critical",
}

VALID_SEVERITY_RANGE = range(0, 6)  # 0 through 5 inclusive


# ── Disposition IDs ─────────────────────────────────────────────────────
# Common disposition values across event classes.

DISPOSITION_IDS: dict[int, str] = {
    1: "Allowed",
    2: "Blocked",
    3: "Quarantined",
    4: "Isolated",
    5: "Deleted",
    6: "Dropped",
    99: "Other",
}


# ── Class-Specific Required Fields ──────────────────────────────────────
# Maps class_uid → list of field names that MUST be present for that class
# to be considered a valid OCSF event. Used by the confidence scorer to
# evaluate output quality.
#
# These are the "recommended" or "required" fields per the OCSF spec for
# each class. A missing field here doesn't make the JSON invalid — it makes
# the normalization incomplete.

CLASS_REQUIRED_FIELDS: dict[int, list[str]] = {
    4001: ["src_endpoint", "dst_endpoint"],       # Network Activity
    4002: ["http_request"],                        # HTTP Activity
    4003: ["query"],                               # DNS Activity
    4004: ["src_endpoint"],                        # DHCP Activity
    4006: ["src_endpoint", "dst_endpoint"],        # SSH Activity
    3002: ["user"],                                # Authentication
    3003: ["user"],                                # Authorize Session
    1007: ["process"],                             # Process Activity
    1001: ["file"],                                # File System Activity
    2001: ["finding_info"],                        # Security Finding
    2004: ["finding_info"],                        # Detection Finding
}


# ── type_uid Formula ────────────────────────────────────────────────────
# type_uid = class_uid * 100 + activity_id
#
# Example: Network Activity (4001) + Traffic (5) = 400105
#
# This is NOT a function — just documentation. The validation logic lives
# in confidence_scorer.py. Keeping the formula here as a comment ensures
# anyone reading this file understands the relationship.
TYPE_UID_MULTIPLIER = 100  # type_uid = class_uid * TYPE_UID_MULTIPLIER + activity_id


# ── Base Required Fields ────────────────────────────────────────────────
# Every OCSF event, regardless of class, must have these fields.
BASE_REQUIRED_FIELDS: list[str] = ["class_uid", "class_name", "metadata"]
