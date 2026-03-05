"""Trend Micro Vision One vendor mapper."""

import logging
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)


def _extract_mitre_techniques(matched_rules: list) -> list:
    """Flatten mitreTechniqueIds across all matchedRules → matchedFilters."""
    seen = set()
    attacks = []
    for rule in matched_rules or []:
        for flt in rule.get("matchedFilters", []):
            for tech_id in flt.get("mitreTechniqueIds", []):
                if tech_id and tech_id not in seen:
                    seen.add(tech_id)
                    attacks.append({"technique": {"uid": tech_id}})
    return attacks


def _extract_analytic_name(matched_rules: list) -> str | None:
    """Return the first matched rule name for finding_info.analytic."""
    for rule in matched_rules or []:
        name = rule.get("name") or rule.get("ruleName")
        if name:
            return name
    return None


def _extract_from_indicators(indicators: list) -> dict:
    """
    Parse indicators array by type. Each indicator has `type`, `value`, etc.
    Value can be a string or a dict (for 'host' type).
    """
    process = {}
    file_obj = {}
    hashes = []
    device = {}
    user_name = None
    observables = []
    unmapped = {}

    for ind in indicators or []:
        itype = ind.get("type", "")
        raw_value = ind.get("value")

        # Resolve value: for host type, value is a dict
        if isinstance(raw_value, dict):
            str_value = raw_value.get("name") or ""
            ips = [ip for ip in raw_value.get("ips", []) if ip]
        else:
            str_value = str(raw_value).strip() if raw_value is not None else ""
            ips = []

        if not str_value and not ips:
            continue

        if itype == "command_line":
            if str_value and not process.get("cmd_line"):
                process["cmd_line"] = str_value

        elif itype == "fullpath":
            if str_value and not file_obj.get("path"):
                file_obj["path"] = str_value
                # Extract filename from path
                filename = str_value.split("\\")[-1].split("/")[-1]
                if filename and not file_obj.get("name"):
                    file_obj["name"] = filename

        elif itype == "file_sha256":
            if str_value:
                h = {"algorithm": "SHA-256", "algorithm_id": 3, "value": str_value}
                if h not in hashes:
                    hashes.append(h)

        elif itype == "host":
            if str_value and not device.get("hostname"):
                device["hostname"] = str_value
            for ip in ips:
                if ip and not device.get("ip"):
                    device["ip"] = ip
                    break

        elif itype == "process_id":
            pid = None
            try:
                pid = int(str_value)
            except (ValueError, TypeError):
                pass
            if pid is not None and not process.get("pid"):
                process["pid"] = pid

        elif itype == "ip":
            observables.append({
                "name": "evidences[].src_endpoint.ip",
                "type": "IP Address",
                "type_id": 2,
                "value": str_value,
            })

        elif itype == "domain":
            observables.append({
                "name": "evidences[].dst_endpoint.domain",
                "type": "Domain",
                "type_id": 28,
                "value": str_value,
            })

        elif itype == "url":
            observables.append({
                "name": "evidences[].dst_endpoint.url",
                "type": "URL",
                "type_id": 5,
                "value": str_value,
            })

        elif itype == "user":
            if str_value and not user_name:
                user_name = str_value

        elif itype == "registry_key":
            unmapped["registry_key"] = str_value

        elif itype == "registry_value":
            unmapped["registry_value"] = str_value

        elif itype == "registry_value_data":
            unmapped["registry_value_data"] = str_value

    if hashes:
        file_obj["hashes"] = hashes
        # Add hash observables
        for h in hashes:
            observables.append({
                "name": "evidences[].process.file.hashes.SHA-256",
                "type": "Hash",
                "type_id": 8,
                "value": h["value"],
            })
    if file_obj.get("name") and not any(
        o["type"] == "File Name" and o["value"] == file_obj["name"] for o in observables
    ):
        observables.append({
            "name": "evidences[].process.file.name",
            "type": "File Name",
            "type_id": 7,
            "value": file_obj["name"],
        })
    if file_obj:
        process["file"] = file_obj

    return {
        "process": process,
        "device": device,
        "user_name": user_name,
        "observables": observables,
        "unmapped": unmapped,
    }


def _extract_from_impact_scope(impact_scope: dict) -> dict:
    """Extract device and user from impactScope.entities as supplemental info."""
    device = {}
    user_name = None
    for entity in (impact_scope or {}).get("entities", []):
        etype = entity.get("entityType", "")
        evalue = entity.get("entityValue")

        if etype == "host" and isinstance(evalue, dict):
            if evalue.get("name") and not device.get("hostname"):
                device["hostname"] = evalue["name"]
            for ip in evalue.get("ips", []):
                if ip and not device.get("ip"):
                    device["ip"] = ip
                    break
        elif etype == "account" and isinstance(evalue, str) and not user_name:
            user_name = evalue

    return {"device": device, "user_name": user_name}


class TrendMicroMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = alert.get("model") or alert.get("alertName")
        uid = alert.get("id") or alert.get("workbenchId")
        if not title or not uid:
            raise ValueError("Missing required Trend Micro fields: model/id")

        finding_info = {"title": title, "uid": str(uid)}
        if alert.get("description"):
            finding_info["desc"] = alert["description"]
        if alert.get("workbenchLink"):
            finding_info["src_url"] = alert["workbenchLink"]

        # Analytic name from matched rules
        analytic_name = _extract_analytic_name(alert.get("matchedRules", []))
        if analytic_name:
            finding_info["analytic"] = {"name": analytic_name, "type": "Rule", "type_id": 1}

        # MITRE attacks → finding_info.attacks (NOT event root)
        attacks = _extract_mitre_techniques(alert.get("matchedRules", []))
        if attacks:
            finding_info["attacks"] = attacks

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": "Vision One",
                "vendor_name": "Trend Micro",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ocsf["time"] = self.normalize_timestamp(
            alert.get("createdDateTime") or alert.get("createdAt")
        )

        # --- severity ---
        sev_id, sev_name = map_string_severity(alert.get("severity"))
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- confidence ---
        if alert.get("score") is not None:
            ocsf["confidence_score"] = int(alert["score"])

        # --- status ---
        if alert.get("investigationStatus"):
            ocsf["status"] = alert["investigationStatus"]

        # --- indicators → process, device, user, observables ---
        ind_data = _extract_from_indicators(alert.get("indicators", []))

        # Supplement with impactScope if indicators didn't provide device/user
        scope_data = _extract_from_impact_scope(alert.get("impactScope", {}))
        device = ind_data["device"] or scope_data["device"]
        user_name = ind_data["user_name"] or scope_data["user_name"]

        if device:
            ocsf["device"] = device

        # --- evidences[] (process → evidences[].process, user → evidences[].actor.user)
        evidences = []
        proc_ev = {}
        if ind_data["process"]:
            proc_ev["process"] = ind_data["process"]
        if user_name:
            proc_ev["actor"] = {"user": {"name": user_name}}
        if proc_ev:
            evidences.append(proc_ev)

        if evidences:
            ocsf["evidences"] = evidences

        # --- observables (deduplicated by value+type) ---
        if ind_data["observables"]:
            seen = set()
            deduped = []
            for obs in ind_data["observables"]:
                key = (obs["type"], obs["value"])
                if key not in seen:
                    seen.add(key)
                    deduped.append(obs)
            ocsf["observables"] = deduped

        # --- unmapped ---
        unmapped = dict(ind_data["unmapped"])
        if alert.get("alertProvider"):
            unmapped["alert_provider"] = alert["alertProvider"]
        if alert.get("modelType"):
            unmapped["model_type"] = alert["modelType"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
