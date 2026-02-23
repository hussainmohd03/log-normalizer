"""
OCSF schema constants.

Pure reference data from the OCSF specification. No business logic.
Both confidence_scorer.py and the validation layer import from here.

Update this file when targeting a new OCSF version.
Verify values against: https://schema.ocsf.io/

"""

# -- Valid OCSF Event Class UIDs ------------------------------------------
# Frozen set signals these are constant, not mutable at runtime.
# Maps class_uid → class_name for the event classes.

VALID_CLASS_UIDS: dict[int, str] = {
    # System Activity (category_uid 1)
    1001: "File System Activity",
    1002: "Kernel Extension Activity",
    1003: "Kernel Activity",
    1004: "Memory Activity",
    1005: "Module Activity",
    1006: "Scheduled Job Activity",
    1007: "Process Activity",
    1008: "Event Log Activity",
    1009: "Script Activity",
    1010: "Peripheral Activity",

    # Findings (category_uid 2)
    2002: "Vulnerability Finding",
    2003: "Compliance Finding",
    2004: "Detection Finding",
    2005: "Incident Finding",
    2006: "Data Security Finding",
    2007: "Application Security Posture Finding",
    2008: "IAM Analysis Finding",


    # Identity & Access Management (category_uid 3)
    3001: "Account Change",
    3002: "Authentication",
    3003: "Authorize Session",
    3004: "Entity Management",
    3005: "User Access Management",
    3006: "Group Management",

    
    # Network Activity (category_uid 4)
    4001: "Network Activity",
    4002: "HTTP Activity",
    4003: "DNS Activity",
    4004: "DHCP Activity",
    4005: "RDP Activity",
    4006: "SMB Activity",
    4007: "SSH Activity",
    4008: "FTP Activity",
    4009: "Email Activity",
    4013: "NTP Activity",
    4014: "Tunnel Activity",

    # Discovery (category_uid 5)
    5001: "Device Inventory Info",
    5003: "User Inventory Info",
    5004: "Operating System Patch State",
    5019: "Device Config State Change",
    5020: "Software Inventory Info",
    5021: "OSINT Inventory Info",
    5023: "Cloud Resources Inventory Info",
    5040: "Live Evidence Info",

    # Application Activity (category_uid 6)
    6001: "Web Resources Activity",
    6002: "Application Lifecycle",
    6003: "API Activity",
    6005: "Datastore Activity",
    6006: "File Hosting Activity",
    6007: "Scan Activity",
    6008: "Application Error",

    # Remediation (category_uid 7)
    7001: "Remediation Activity",
    7002: "File Remediation Activity",
    7003: "Process Remediation Activity",
    7004: "Network Remediation Activity",

}

VALID_CLASS_UID_SET: frozenset[int] = frozenset(VALID_CLASS_UIDS.keys())


# -- Severity IDs ------------------------------------------
# OCSF severity_id enum — applies to all event classes.

SEVERITY_IDS: dict[int, str] = {
    0: "Unknown",
    1: "Informational",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Critical",
    6: "Fatal",
    99: "Other"
}

VALID_SEVERITY_IDS: frozenset[int] = frozenset(SEVERITY_IDS.keys())  # {0,1,2,3,4,5,6,99}


# -- Disposition IDs ------------------------------------------
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


# -- Class-Specific Required Fields -----------------------------------------
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


# -- type_uid Formula ------------------------------------------
# type_uid = class_uid * 100 + activity_id
#
# Example: Network Activity (4001) + Traffic (5) = 400105
#
# This is NOT a function — just documentation. The validation logic lives
# in confidence_scorer.py. Keeping the formula here as a comment ensures
# anyone reading this file understands the relationship.
TYPE_UID_MULTIPLIER = 100  # type_uid = class_uid * TYPE_UID_MULTIPLIER + activity_id


# -- Base Required Fields ------------------------------------------
# Every OCSF event, regardless of class, must have these fields.
BASE_REQUIRED_FIELDS: list[str] = ["class_uid", "class_name", "metadata"]
