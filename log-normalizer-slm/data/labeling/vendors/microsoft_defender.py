"""Microsoft Defender for Office 365 vendor mapper."""

import logging
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_string_severity

logger = logging.getLogger(__name__)

# Microsoft status → OCSF (status_id, status)
_STATUS_MAP = {
    "new": (1, "New"),
    "inprogress": (2, "In Progress"),
    "in_progress": (2, "In Progress"),
    "resolved": (4, "Closed"),
    "redirected": (4, "Closed"),
}

_EMAIL_EVIDENCE_TYPE = "#microsoft.graph.security.analyzedMessageEvidence"
_MAILBOX_EVIDENCE_TYPE = "#microsoft.graph.security.mailboxEvidence"
_USER_EVIDENCE_TYPE = "#microsoft.graph.security.userEvidence"
_URL_EVIDENCE_TYPE = "#microsoft.graph.security.urlEvidence"
_IP_EVIDENCE_TYPE = "#microsoft.graph.security.ipEvidence"
_PROCESS_EVIDENCE_TYPE = "#microsoft.graph.security.processEvidence"


def _map_evidence(evidence_list: list) -> dict:
    """
    Parse Microsoft Defender evidence array into OCSF evidence components.
    Returns structured data for building evidences[].
    """
    user_name = None
    user_email = None
    src_ip = None
    urls = []
    email_subject = None
    email_from = None
    email_to = []
    process = {}

    for ev in evidence_list:
        if not isinstance(ev, dict):
            continue
        ev_type = ev.get("@odata.type", "")

        if ev_type == _MAILBOX_EVIDENCE_TYPE:
            ua = ev.get("userAccount", {}) or {}
            if ua.get("accountName") and not user_name:
                user_name = ua["accountName"]
            if ev.get("primaryAddress") and not user_email:
                user_email = ev["primaryAddress"]

        elif ev_type == _USER_EVIDENCE_TYPE:
            ua = ev.get("userAccount", {}) or {}
            if ua.get("accountName") and not user_name:
                user_name = ua["accountName"]
            if ua.get("userPrincipalName") and not user_email:
                user_email = ua["userPrincipalName"]

        elif ev_type == _EMAIL_EVIDENCE_TYPE:
            if ev.get("senderIp") and not src_ip:
                src_ip = ev["senderIp"]
            if ev.get("subject") and not email_subject:
                email_subject = ev["subject"]
            if ev.get("sender") and not email_from:
                email_from = ev["sender"]
            recipients = ev.get("recipients") or []
            if recipients:
                email_to.extend([r for r in recipients if r])
            for url in ev.get("urls", []) or []:
                if url:
                    urls.append(url)

        elif ev_type == _URL_EVIDENCE_TYPE:
            url = ev.get("url")
            if url:
                urls.append(url)

        elif ev_type == _IP_EVIDENCE_TYPE:
            ip = ev.get("ipAddress")
            if ip and not src_ip:
                src_ip = ip

        elif ev_type == _PROCESS_EVIDENCE_TYPE:
            if ev.get("processId") and not process.get("pid"):
                pid = None
                try:
                    pid = int(ev["processId"])
                except (TypeError, ValueError):
                    pass
                if pid:
                    process["pid"] = pid
            if ev.get("imageFile") and not process.get("file"):
                img = ev["imageFile"]
                file_obj = {}
                if img.get("name"):
                    file_obj["name"] = img["name"]
                if img.get("path"):
                    file_obj["path"] = img["path"]
                if file_obj:
                    process["file"] = file_obj

    return {
        "user_name": user_name,
        "user_email": user_email,
        "src_ip": src_ip,
        "urls": urls,
        "email_subject": email_subject,
        "email_from": email_from,
        "email_to": email_to,
        "process": process,
    }


class MicrosoftDefenderMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = alert.get("title")
        uid = alert.get("id") or alert.get("alertId") or alert.get("providerAlertId")
        if not title or not uid:
            raise ValueError("Missing required Microsoft Defender fields: title/id")

        finding_info = {"title": title, "uid": str(uid)}
        if alert.get("description"):
            finding_info["desc"] = alert["description"]
        if alert.get("category"):
            finding_info["types"] = [alert["category"]]
        if alert.get("createdDateTime"):
            finding_info["created_time"] = self.normalize_timestamp(alert["createdDateTime"])
        if alert.get("alertWebUrl") or alert.get("incidentWebUrl"):
            finding_info["src_url"] = alert.get("alertWebUrl") or alert["incidentWebUrl"]

        # MITRE attacks → finding_info.attacks (NOT event root)
        mitre_techniques = alert.get("mitreTechniques") or []
        if mitre_techniques:
            attacks = []
            for tech_id in mitre_techniques:
                if tech_id:
                    attacks.append({"technique": {"uid": tech_id}})
            if attacks:
                finding_info["attacks"] = attacks

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        ocsf["metadata"] = {
            "product": {
                "name": alert.get("productName") or "Microsoft Defender for Office 365",
                "vendor_name": "Microsoft",
            },
            "version": "1.1.0",
        }

        # --- time ---
        ocsf["time"] = self.normalize_timestamp(alert.get("createdDateTime"))

        # --- severity ---
        sev_id, sev_name = map_string_severity(alert.get("severity"))
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- status ---
        raw_status = alert.get("status", "")
        if raw_status:
            normalized_key = raw_status.lower().replace(" ", "")
            if normalized_key in _STATUS_MAP:
                status_id, status_label = _STATUS_MAP[normalized_key]
                ocsf["status_id"] = status_id
                ocsf["status"] = status_label
            else:
                ocsf["status"] = raw_status

        # --- parse evidence array ---
        evidence_list = alert.get("evidence") or []
        ev_data = _map_evidence(evidence_list)

        # --- evidences[] (actor.user, src_endpoint, email, process) ---
        evidences = []

        # Email + network evidence
        email_ev = {}
        if ev_data["src_ip"]:
            email_ev["src_endpoint"] = {"ip": ev_data["src_ip"]}
        email_obj = {}
        if ev_data["email_subject"]:
            email_obj["subject"] = ev_data["email_subject"]
        if ev_data["email_from"]:
            email_obj["from"] = ev_data["email_from"]
        if ev_data["email_to"]:
            email_obj["to"] = ev_data["email_to"]
        if email_obj:
            email_ev["email"] = email_obj
        if email_ev:
            evidences.append(email_ev)

        # User evidence
        user = {}
        if ev_data["user_name"]:
            user["name"] = ev_data["user_name"]
        if ev_data["user_email"]:
            user["email_addr"] = ev_data["user_email"]
        if user:
            evidences.append({"actor": {"user": user}})

        # Process evidence
        if ev_data["process"]:
            evidences.append({"process": ev_data["process"]})

        if evidences:
            ocsf["evidences"] = evidences

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

        if ev_data["src_ip"]:
            add_obs("evidences[].src_endpoint.ip", "IP Address", ev_data["src_ip"])
        if ev_data["user_email"]:
            add_obs("evidences[].actor.user.email_addr", "Email Address", ev_data["user_email"])
        for url in ev_data["urls"]:
            add_obs("evidences[].email.url", "URL", url)

        if observables:
            ocsf["observables"] = observables

        # --- unmapped ---
        unmapped = {}
        if alert.get("detectionSource"):
            unmapped["detection_source"] = alert["detectionSource"]
        if alert.get("incidentId"):
            unmapped["incident_id"] = str(alert["incidentId"])
        if alert.get("detectorId"):
            unmapped["detector_id"] = str(alert["detectorId"])
        if alert.get("providerAlertId"):
            unmapped["provider_alert_id"] = str(alert["providerAlertId"])
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
