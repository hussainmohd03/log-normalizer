"""Microsoft Sentinel vendor mapper."""

import logging
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)

# Sentinel status → OCSF (status_id, status)
_STATUS_MAP = {
    "new": (1, "New"),
    "active": (2, "In Progress"),
    "open": (2, "In Progress"),
    "inprogress": (2, "In Progress"),
    "resolved": (4, "Closed"),
    "closed": (4, "Closed"),
}


def _map_entities(entities: list) -> dict:
    """
    Parse Sentinel entity list. Each entity has `kind` and `properties` dict.
    Returns extracted device, user, src_ip, observables, email data.
    """
    device = {}
    user = {}
    src_ip = None
    observables = []
    email_subject = None
    email_from = None

    for entity in entities:
        if not isinstance(entity, dict):
            continue
        kind = entity.get("kind", "")
        props = entity.get("properties", {}) or {}

        if kind == "Ip":
            ip = props.get("address") or props.get("friendlyName")
            if ip and not src_ip:
                src_ip = ip
            if ip:
                observables.append({
                    "name": "evidences[].src_endpoint.ip",
                    "type": "IP Address",
                    "type_id": 2,
                    "value": ip,
                })

        elif kind == "Host":
            if props.get("hostName") and not device.get("hostname"):
                device["hostname"] = props["hostName"]
            if props.get("osFamily") and not device.get("os"):
                device["os"] = {"name": props["osFamily"]}
            if props.get("dnsDomain"):
                device["domain"] = props["dnsDomain"]

        elif kind == "Account":
            if props.get("accountName") and not user.get("name"):
                user["name"] = props["accountName"]
            if props.get("upnSuffix") and not user.get("email_addr"):
                user["email_addr"] = f"{props.get('accountName', '')}@{props['upnSuffix']}"

        elif kind == "Url":
            url = props.get("url") or props.get("friendlyName")
            if url and not url.startswith("/"):
                observables.append({
                    "name": "evidences[].dst_endpoint.url",
                    "type": "URL",
                    "type_id": 5,
                    "value": url,
                })

        elif kind == "Mailbox":
            addr = props.get("mailboxPrimaryAddress")
            if addr and not user.get("email_addr"):
                user["email_addr"] = addr

        elif kind == "MailMessage":
            subject = props.get("subject")
            if subject:
                email_subject = subject
            sender = props.get("sender") or props.get("senderAddress")
            if sender and not email_from:
                email_from = sender
            sender_ip = props.get("senderIp")
            if sender_ip and not src_ip:
                src_ip = sender_ip

    return {
        "device": device,
        "user": user,
        "src_ip": src_ip,
        "observables": observables,
        "email_subject": email_subject,
        "email_from": email_from,
    }


class SentinelMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        props = alert.get("properties", {}) or {}
        additional = props.get("additionalData", {}) or {}

        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = props.get("title")
        uid = props.get("incidentNumber") or alert.get("name")
        if not title or uid is None:
            raise ValueError("Missing required Sentinel fields: properties.title/incidentNumber")

        finding_info = {"title": title, "uid": str(uid)}
        if props.get("description"):
            finding_info["desc"] = props["description"]
        if props.get("incidentUrl"):
            finding_info["src_url"] = props["incidentUrl"]

        # MITRE attacks → finding_info.attacks (NOT event root)
        tactics = additional.get("tactics") or []
        techniques = additional.get("techniques") or []
        if tactics or techniques:
            attacks = []
            max_len = max(len(tactics), len(techniques)) if (tactics or techniques) else 0
            for i in range(max_len):
                attack = {}
                if i < len(tactics) and tactics[i]:
                    attack["tactic"] = {"name": tactics[i]}
                if i < len(techniques) and techniques[i]:
                    attack["technique"] = {"uid": techniques[i]}
                if attack:
                    attacks.append(attack)
            if attacks:
                finding_info["attacks"] = attacks

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        product_names = additional.get("alertProductNames") or []
        product_name = product_names[0] if product_names else "Microsoft Sentinel"
        ocsf["metadata"] = {
            "product": {
                "name": product_name,
                "vendor_name": "Microsoft",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ocsf["time"] = self.normalize_timestamp(props.get("createdTimeUtc"))

        # --- severity ---
        sev_id, sev_name = map_string_severity(props.get("severity"))
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- status ---
        raw_status = (props.get("status") or "").lower().strip()
        if raw_status in _STATUS_MAP:
            status_id, status_label = _STATUS_MAP[raw_status]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id
        elif props.get("status"):
            ocsf["status"] = props["status"]

        # --- entities ---
        entities = alert.get("entities", []) or []
        ev = _map_entities(entities)

        if ev["device"]:
            ocsf["device"] = ev["device"]

        # --- evidences (user → actor.user, ip → src_endpoint, email → email) ---
        evidences = []

        if ev["user"]:
            evidences.append({"actor": {"user": ev["user"]}})

        email_ev = {}
        if ev["src_ip"]:
            email_ev["src_endpoint"] = {"ip": ev["src_ip"]}
        email_obj = {}
        if ev["email_subject"]:
            email_obj["subject"] = ev["email_subject"]
        if ev["email_from"]:
            email_obj["from"] = ev["email_from"]
        if email_obj:
            email_ev["email"] = email_obj
        if email_ev:
            evidences.append(email_ev)

        if evidences:
            ocsf["evidences"] = evidences

        # --- observables (deduplicate by value) ---
        if ev["observables"]:
            seen_vals = set()
            deduped = []
            for obs in ev["observables"]:
                if obs["value"] not in seen_vals:
                    seen_vals.add(obs["value"])
                    deduped.append(obs)
            ocsf["observables"] = deduped

        # --- unmapped ---
        unmapped = {}
        if props.get("providerIncidentId"):
            unmapped["provider_incident_id"] = str(props["providerIncidentId"])
        if additional.get("alertsCount") is not None:
            unmapped["alerts_count"] = additional["alertsCount"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
