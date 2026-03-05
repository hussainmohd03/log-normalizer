"""Palo Alto Cortex XDR vendor mapper."""

import logging
import re
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)

# platform → (os.type, os.type_id)
_OS_TYPE_MAP = {
    "windows": ("Windows", 100),
    "macos": ("macOS", 200),
    "mac": ("macOS", 200),
    "linux": ("Linux", 300),
    "android": ("Android", 400),
    "ios": ("iOS", 500),
}


def _parse_mitre_id_name(raw: str) -> tuple:
    """
    Parse 'T1036 - Masquerading' or 'TA0005 - Defense Evasion'.
    Returns (uid, name). Either may be None.
    """
    if not raw or not isinstance(raw, str):
        return None, None
    raw = raw.strip()
    m = re.match(r"^([A-Z]{1,2}\d{4}(?:\.\d+)?)\s*-\s*(.+)$", raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, raw


class PaloAltoMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = alert.get("name")
        uid = alert.get("alert_id") or alert.get("external_id")
        if not title or not uid:
            raise ValueError("Missing required Palo Alto fields: name/alert_id")

        finding_info = {"title": title, "uid": str(uid)}
        if alert.get("description"):
            finding_info["desc"] = alert["description"]
        if alert.get("category"):
            finding_info["types"] = [alert["category"]]

        # MITRE attacks → finding_info.attacks (NOT event root)
        tactic_raw = alert.get("mitre_tactic_id_and_name")
        technique_raw = alert.get("mitre_technique_id_and_name")
        if tactic_raw or technique_raw:
            attack = {}
            if tactic_raw:
                tac_uid, tac_name = _parse_mitre_id_name(str(tactic_raw))
                attack["tactic"] = {}
                if tac_uid:
                    attack["tactic"]["uid"] = tac_uid
                if tac_name:
                    attack["tactic"]["name"] = tac_name
            if technique_raw:
                tech_uid, tech_name = _parse_mitre_id_name(str(technique_raw))
                attack["technique"] = {}
                if tech_uid:
                    attack["technique"]["uid"] = tech_uid
                if tech_name:
                    attack["technique"]["name"] = tech_name
            if attack:
                finding_info["attacks"] = [attack]

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": alert.get("source") or "Cortex XDR",
                "vendor_name": "Palo Alto Networks",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ts = (
            alert.get("detection_timestamp")
            or alert.get("event_timestamp")
            or alert.get("local_insert_ts")
        )
        ocsf["time"] = self.normalize_timestamp(ts)

        # --- severity ---
        sev_id, sev_name = map_string_severity(alert.get("severity"))
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- device ---
        device = {}
        if alert.get("host_name"):
            device["hostname"] = alert["host_name"]
        host_ip = alert.get("host_ip")
        if host_ip:
            first_ip = str(host_ip).split(",")[0].strip()
            if first_ip:
                device["ip"] = first_ip
        mac = alert.get("mac")
        if mac:
            first_mac = str(mac).split(",")[0].strip()
            if first_mac:
                device["mac"] = first_mac
        endpoint_id = alert.get("endpoint_id")
        if endpoint_id:
            device["uid"] = str(endpoint_id)

        os_type_raw = (alert.get("agent_os_type") or "").lower()
        os_version = alert.get("agent_os_sub_type") or alert.get("agent_os_type")
        if os_type_raw or os_version:
            os_obj = {}
            if os_version:
                os_obj["name"] = os_version
            if os_type_raw:
                os_type, os_type_id = _OS_TYPE_MAP.get(os_type_raw, (None, None))
                if os_type:
                    os_obj["type"] = os_type
                    os_obj["type_id"] = os_type_id
            if os_obj:
                device["os"] = os_obj

        if device:
            ocsf["device"] = device

        # --- evidences (process, actor.user, endpoints) ---
        process = {}

        # Command line
        cmd = alert.get("action_process_image_command_line") or alert.get("action_process_cmdline")
        if cmd:
            process["cmd_line"] = cmd

        file_obj = {}
        if alert.get("action_file_name"):
            file_obj["name"] = alert["action_file_name"]
        if alert.get("action_file_path"):
            file_obj["path"] = alert["action_file_path"]
        sha256 = self.build_hash("SHA-256", alert.get("action_file_sha256", ""))
        if sha256:
            file_obj["hashes"] = [sha256]
        md5 = self.build_hash("MD5", alert.get("action_file_md5", ""))
        if md5:
            file_obj.setdefault("hashes", []).append(md5)
        if file_obj:
            process["file"] = file_obj

        evidence = {}
        if process:
            evidence["process"] = process

        user_name = alert.get("user_name")
        if user_name and user_name != "N/A":
            evidence["actor"] = {"user": {"name": user_name}}

        action_remote_ip = alert.get("action_remote_ip")
        if action_remote_ip:
            evidence["dst_endpoint"] = {"ip": str(action_remote_ip)}
            remote_port = self.safe_int(alert.get("action_remote_port"))
            if remote_port:
                evidence["dst_endpoint"]["port"] = remote_port

        action_local_ip = alert.get("action_local_ip")
        if action_local_ip:
            evidence["src_endpoint"] = {"ip": str(action_local_ip)}
            local_port = self.safe_int(alert.get("action_local_port"))
            if local_port:
                evidence["src_endpoint"]["port"] = local_port

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

        if device.get("ip"):
            add_obs("device.ip", "IP Address", device["ip"])
        if action_remote_ip:
            add_obs("evidences[].dst_endpoint.ip", "IP Address", str(action_remote_ip))
        if file_obj.get("name"):
            add_obs("evidences[].process.file.name", "File Name", file_obj["name"])
        for h in (file_obj.get("hashes") or []):
            if h.get("algorithm") == "SHA-256":
                add_obs("evidences[].process.file.hashes.SHA-256", "Hash", h["value"])
            elif h.get("algorithm") == "MD5":
                add_obs("evidences[].process.file.hashes.MD5", "Hash", h["value"])

        if observables:
            ocsf["observables"] = observables

        # --- unmapped ---
        unmapped = {}
        if alert.get("module_id"):
            unmapped["module_id"] = alert["module_id"]
        if alert.get("alert_type"):
            unmapped["alert_type"] = alert["alert_type"]
        if alert.get("matching_status"):
            unmapped["matching_status"] = alert["matching_status"]
        if endpoint_id:
            unmapped["endpoint_id"] = str(endpoint_id)
        if alert.get("external_id"):
            unmapped["external_id"] = str(alert["external_id"])
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
