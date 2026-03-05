"""LogRhythm AIE vendor mapper."""

import logging
import re
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_logrhythm_severity

logger = logging.getLogger(__name__)

# Regex to extract MITRE tactic ID from alarm rule name
_MITRE_TACTIC_RE = re.compile(r"MITRE-([A-Z]{2}\d{4})")

# LogRhythm alarmStatus integer → OCSF (status_id, status)
_STATUS_MAP = {
    0: (1, "New"),
    1: (2, "In Progress"),
    2: (2, "In Progress"),
    3: (4, "Closed"),
    4: (4, "Closed"),
    5: (4, "Closed"),
    6: (4, "Closed"),
    7: (3, "Suppressed"),
    8: (1, "New"),
}

_STATUS_NAME_MAP = {
    "new": (1, "New"),
    "working": (2, "In Progress"),
    "escalated": (2, "In Progress"),
    "closed": (4, "Closed"),
    "suppressed": (3, "Suppressed"),
    "pending": (1, "New"),
}


class LogRhythmMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        # Real LogRhythm data nests everything under alarmDetails
        details = alert.get("alarmDetails", alert)

        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = details.get("alarmRuleName")
        uid = details.get("alarmId")
        if not title or uid is None:
            raise ValueError("Missing required LogRhythm fields: alarmRuleName/alarmId")

        finding_info = {
            "title": title,
            "uid": str(uid),
            # alarmRuleName is the detection rule → analytic
            "analytic": {"name": title, "type": "Rule", "type_id": 1},
        }

        # MITRE attacks from rule name → finding_info.attacks (NOT event root)
        mitre_matches = _MITRE_TACTIC_RE.findall(title)
        if mitre_matches:
            finding_info["attacks"] = [{"tactic": {"uid": m}} for m in mitre_matches]

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": "LogRhythm SIEM",
                "vendor_name": "LogRhythm",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ts = details.get("dateInserted") or details.get("alarmDate")
        ocsf["time"] = self.normalize_timestamp(ts)

        # --- start_time / end_time (from event window, NOT unmapped) ---
        if details.get("eventDateFirst"):
            ocsf["start_time"] = self.normalize_timestamp(details["eventDateFirst"])
        if details.get("eventDateLast"):
            ocsf["end_time"] = self.normalize_timestamp(details["eventDateLast"])

        # --- severity ---
        rbp_max = details.get("rbpMax")
        sev_id, sev_name = map_logrhythm_severity(rbp_max)
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- status ---
        alarm_status = details.get("alarmStatus")
        alarm_status_name = (details.get("alarmStatusName") or "").lower().strip()
        if alarm_status_name in _STATUS_NAME_MAP:
            status_id, status_label = _STATUS_NAME_MAP[alarm_status_name]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id
        elif alarm_status is not None and alarm_status in _STATUS_MAP:
            status_id, status_label = _STATUS_MAP[alarm_status]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id

        # --- count ---
        event_count = details.get("eventCount")
        if event_count is not None:
            cnt = self.safe_int(event_count)
            if cnt is not None and cnt > 0:
                ocsf["count"] = cnt

        # --- device (entityName is typically a hostname in LogRhythm) ---
        entity_name = details.get("entityName")
        if entity_name:
            ocsf["device"] = {"hostname": entity_name}

        # --- vendor_attributes (raw rbpMax score) ---
        if rbp_max is not None:
            ocsf["vendor_attributes"] = {"rbp_max": rbp_max}

        # --- unmapped ---
        unmapped = {}
        if details.get("lastUpdatedName"):
            unmapped["last_updated_by"] = details["lastUpdatedName"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
