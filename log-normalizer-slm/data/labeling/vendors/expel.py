"""Expel vendor mapper."""

import logging
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)

# attack_lifecycle → MITRE tactic name
_LIFECYCLE_MAP = {
    "DELIVERY": "Initial Access",
    "EXPLOITATION": "Execution",
    "INSTALLATION": "Persistence",
    "C2": "Command and Control",
    "COMMAND_CONTROL": "Command and Control",
    "ACTIONS_ON_OBJECTIVES": "Impact",
    "RECONNAISSANCE": "Reconnaissance",
}

# analyst_severity string → severity_id (Expel may use string values)
_ANALYST_SEVERITY_MAP = {
    "low": (2, "Low"),
    "medium": (3, "Medium"),
    "high": (4, "High"),
    "critical": (5, "Critical"),
    "informational": (1, "Informational"),
}


class ExpelMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        attrs = alert.get("attributes", {}) or {}

        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = attrs.get("title")
        uid = alert.get("id")
        if not title or not uid:
            raise ValueError("Missing required Expel fields: attributes.title/id")

        finding_info = {"title": title, "uid": str(uid)}
        detection_type = attrs.get("detection_type")
        if detection_type:
            finding_info["types"] = [detection_type]
        # short_link → finding_info.src_url (per OCSF spec guidance for Expel)
        if attrs.get("short_link"):
            finding_info["src_url"] = attrs["short_link"]
        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": "Expel Workbench",
                "vendor_name": "Expel",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ocsf["time"] = self.normalize_timestamp(attrs.get("created_at") or attrs.get("updated_at"))

        # --- severity ---
        analyst_sev = attrs.get("analyst_severity")
        if analyst_sev is None:
            ocsf["severity_id"] = 0
            ocsf["severity"] = "Unknown"
        elif isinstance(analyst_sev, str):
            sev_id, sev_name = _ANALYST_SEVERITY_MAP.get(analyst_sev.lower(), (0, "Unknown"))
            ocsf["severity_id"] = sev_id
            ocsf["severity"] = sev_name
        else:
            ocsf["severity_id"] = 0
            ocsf["severity"] = "Unknown"

        # --- status_id from is_incident ---
        is_incident = attrs.get("is_incident")
        if is_incident is True:
            ocsf["status_id"] = 2
            ocsf["status"] = "In Progress"
        elif is_incident is False:
            ocsf["status_id"] = 1
            ocsf["status"] = "New"

        # --- attacks → finding_info.attacks (NOT event root) ---
        lifecycle = attrs.get("attack_lifecycle")
        if lifecycle:
            tactic_name = _LIFECYCLE_MAP.get(lifecycle.upper())
            if tactic_name:
                ocsf["finding_info"]["attacks"] = [{"tactic": {"name": tactic_name}}]

        # --- unmapped ---
        unmapped = {}
        if attrs.get("threat_type"):
            unmapped["threat_type"] = attrs["threat_type"]
        if attrs.get("attack_vector"):
            unmapped["attack_vector"] = attrs["attack_vector"]
        if attrs.get("attack_timing"):
            unmapped["attack_timing"] = attrs["attack_timing"]
        if attrs.get("malware_family"):
            unmapped["malware_family"] = attrs["malware_family"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
