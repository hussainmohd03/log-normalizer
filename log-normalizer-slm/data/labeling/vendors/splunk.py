"""Splunk Enterprise Security vendor mapper."""

import json
import logging
import re
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)

# Splunk string status → OCSF (status_id, status)
_STATUS_MAP = {
    "new": (1, "New"),
    "inprogress": (2, "In Progress"),
    "in progress": (2, "In Progress"),
    "open": (2, "In Progress"),
    "closed": (4, "Closed"),
    "resolved": (4, "Closed"),
    "suppressed": (3, "Suppressed"),
}

# Splunk ES numeric status codes → OCSF (status_id, status)
_NUMERIC_STATUS_MAP = {
    "0": (1, "New"),        # Unassigned
    "1": (1, "New"),        # Assigned
    "2": (2, "In Progress"),
    "3": (2, "In Progress"), # Pending
    "4": (4, "Closed"),     # Resolved
    "5": (4, "Closed"),     # Closed
    "6": (4, "Closed"),
    "7": (3, "Suppressed"),
}

_ZERO_GUID = "00000000-0000-0000-0000-000000000000"


def _parse_mitre(alert: dict) -> list:
    """
    Extract MITRE tactic names from Splunk notable.
    Tries flat field `annotations.mitre_attack` then JSON-encoded `annotations`.
    """
    tactics = set()
    flat = alert.get("annotations.mitre_attack")
    if flat:
        if isinstance(flat, list):
            for t in flat:
                tactics.add(str(t).strip())
        else:
            tactics.add(str(flat).strip())

    annotations_raw = alert.get("annotations")
    if isinstance(annotations_raw, str) and annotations_raw.strip().startswith("{"):
        try:
            annotations_obj = json.loads(annotations_raw)
            for t in annotations_obj.get("mitre_attack", []):
                tactics.add(str(t).strip())
        except (json.JSONDecodeError, TypeError):
            pass
    elif isinstance(annotations_raw, dict):
        for t in annotations_raw.get("mitre_attack", []):
            tactics.add(str(t).strip())

    attacks = []
    for tactic_name in sorted(tactics):
        if tactic_name:
            attacks.append({"tactic": {"name": tactic_name}})
    return attacks


def _looks_like_ip(s: str) -> bool:
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", s):
        return True
    if ":" in s and not s.endswith("."):
        return True
    return False


class SplunkMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = (
            alert.get("search_name")
            or alert.get("rule_name")
            or alert.get("rule_title")
            or alert.get("signature")
        )
        uid = alert.get("rule_id") or alert.get("event_id") or alert.get("_cd")
        if not title:
            raise ValueError("Missing required Splunk fields: search_name/rule_name")
        if not uid:
            uid = f"splunk-{alert.get('_bkt', 'unknown')}"

        finding_info = {"title": title, "uid": str(uid)}
        desc = alert.get("rule_description") or alert.get("savedsearch_description")
        if desc:
            finding_info["desc"] = desc
        if alert.get("webUrl"):
            finding_info["src_url"] = alert["webUrl"]

        # Analytic (search_name is the detection rule)
        search_name = alert.get("search_name") or alert.get("rule_name")
        if search_name:
            finding_info["analytic"] = {"name": search_name, "type": "Rule", "type_id": 1}

        # MITRE attacks → finding_info.attacks (NOT event root)
        attacks = _parse_mitre(alert)
        if attacks:
            finding_info["attacks"] = attacks

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": "Splunk Enterprise Security",
                "vendor_name": "Splunk",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ocsf["time"] = self.normalize_timestamp(alert.get("_time") or alert.get("timestamp"))

        # --- severity --- (Splunk uses `urgency` not `severity`)
        sev_raw = alert.get("urgency") or alert.get("severity")
        sev_id, sev_name = map_string_severity(sev_raw)
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- status ---
        raw_status = str(alert.get("status") or alert.get("disposition") or "").strip()
        lower_status = raw_status.lower()
        if lower_status in _STATUS_MAP:
            status_id, status_label = _STATUS_MAP[lower_status]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id
        elif raw_status in _NUMERIC_STATUS_MAP:
            status_id, status_label = _NUMERIC_STATUS_MAP[raw_status]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id

        # --- evidences (src_endpoint, dst_endpoint, actor.user) ---
        evidence = {}

        src_ip = self.first_nonempty([alert.get("src_ip"), alert.get("src")])
        if src_ip:
            if isinstance(src_ip, list):
                src_ip = src_ip[0]
            if src_ip and _looks_like_ip(str(src_ip)):
                evidence["src_endpoint"] = {"ip": str(src_ip)}

        dst_ip = self.first_nonempty([alert.get("dest_ip"), alert.get("dest")])
        if dst_ip:
            if isinstance(dst_ip, list):
                dst_ip = dst_ip[0]
            if dst_ip and _looks_like_ip(str(dst_ip)):
                evidence["dst_endpoint"] = {"ip": str(dst_ip)}

        user_val = alert.get("user") or alert.get("user_id")
        # Filter zero-GUIDs — these are placeholder values, not real user identifiers
        if user_val and str(user_val) != _ZERO_GUID:
            evidence["actor"] = {"user": {"name": str(user_val)}}

        if evidence:
            ocsf["evidences"] = [evidence]

        # --- observables ---
        observables = []
        seen_obs = set()

        def add_obs(name, type_str, value):
            key = (type_str, str(value))
            if key not in seen_obs and value:
                seen_obs.add(key)
                obs = self.build_observable(name, type_str, str(value))
                if obs:
                    observables.append(obs)

        if evidence.get("src_endpoint", {}).get("ip"):
            add_obs("evidences[].src_endpoint.ip", "IP Address", evidence["src_endpoint"]["ip"])
        if evidence.get("dst_endpoint", {}).get("ip"):
            add_obs("evidences[].dst_endpoint.ip", "IP Address", evidence["dst_endpoint"]["ip"])
        if user_val and str(user_val) != _ZERO_GUID:
            add_obs("evidences[].actor.user.name", "User Name", str(user_val))

        orig_host = alert.get("orig_host")
        if orig_host and _looks_like_ip(str(orig_host)):
            add_obs("evidences[].src_endpoint.ip", "IP Address", str(orig_host))

        if observables:
            ocsf["observables"] = observables

        # --- unmapped ---
        unmapped = {}
        if alert.get("app"):
            unmapped["app"] = alert["app"]
        if alert.get("vendor_product"):
            unmapped["vendor_product"] = alert["vendor_product"]
        if alert.get("security_domain"):
            unmapped["security_domain"] = alert["security_domain"]
        if alert.get("sid"):
            unmapped["sid"] = str(alert["sid"])
        if alert.get("search_name"):
            unmapped["search_name"] = alert["search_name"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
