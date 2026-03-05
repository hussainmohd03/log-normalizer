"""CrowdStrike Falcon vendor mapper."""

import logging
from labeling.vendors.base import BaseVendor
from labeling.utils.severity import map_crowdstrike_severity

logger = logging.getLogger(__name__)

# CrowdStrike status → OCSF (status_id, status)
_STATUS_MAP = {
    "new": (1, "New"),
    "in_progress": (2, "In Progress"),
    "true_positive": (4, "Closed"),
    "closed": (4, "Closed"),
    "false_positive": (4, "Closed"),
}

# IOC type → (observable field path, OCSF type string)
_IOC_FIELD_PATH = {
    "domain": ("evidences[].dst_endpoint.domain", "Domain"),
    "ip_address": ("evidences[].dst_endpoint.ip", "IP Address"),
    "sha256": ("evidences[].process.file.hashes.SHA-256", "Hash"),
    "md5": ("evidences[].process.file.hashes.MD5", "Hash"),
    "url": ("evidences[].dst_endpoint.url", "URL"),
    "hostname": ("device.hostname", "Hostname"),
}

# platform_name → (os.type, os.type_id)
_OS_TYPE_MAP = {
    "windows": ("Windows", 100),
    "macos": ("macOS", 200),
    "mac os x": ("macOS", 200),
    "linux": ("Linux", 300),
    "android": ("Android", 400),
    "ios": ("iOS", 500),
}


class CrowdStrikeMapper(BaseVendor):

    def map(self, raw_log: dict) -> dict:
        alert = raw_log.get("alert", {})
        ocsf = self._base_ocsf()

        # --- finding_info ---
        title = alert.get("display_name") or alert.get("name")
        uid = alert.get("composite_id") or alert.get("id") or alert.get("indicator_id")
        if not title or not uid:
            raise ValueError("Missing required CrowdStrike fields: display_name/id")

        finding_info = {"title": title, "uid": uid}
        if alert.get("description"):
            finding_info["desc"] = alert["description"]
        if alert.get("falcon_host_link"):
            finding_info["src_url"] = alert["falcon_host_link"]
        if alert.get("created_timestamp"):
            finding_info["created_time"] = self.normalize_timestamp(alert["created_timestamp"])

        # Analytic (detection rule)
        rule_name = alert.get("name") or alert.get("display_name")
        if rule_name:
            analytic = {"name": rule_name, "type": "Rule", "type_id": 1}
            if alert.get("pattern_id") is not None:
                analytic["uid"] = str(alert["pattern_id"])
            finding_info["analytic"] = analytic

        # MITRE attacks → finding_info.attacks (NOT event root)
        tactic_name = alert.get("tactic")
        tactic_uid = alert.get("tactic_id")
        technique_name = alert.get("technique")
        technique_uid = alert.get("technique_id")
        if tactic_name or tactic_uid or technique_name or technique_uid:
            attack = {}
            if tactic_name or tactic_uid:
                attack["tactic"] = {}
                if tactic_name:
                    attack["tactic"]["name"] = tactic_name
                if tactic_uid:
                    attack["tactic"]["uid"] = tactic_uid
            if technique_name or technique_uid:
                attack["technique"] = {}
                if technique_name:
                    attack["technique"]["name"] = technique_name
                if technique_uid:
                    attack["technique"]["uid"] = technique_uid
            finding_info["attacks"] = [attack]

        ocsf["finding_info"] = finding_info

        # --- metadata ---
        product_name = None
        vendor_name = None
        if alert.get("source_products"):
            product_name = alert["source_products"][0]
        if alert.get("source_vendors"):
            vendor_name = alert["source_vendors"][0]
        meta = {
            "product": {
                "name": product_name or "Falcon",
                "vendor_name": vendor_name or "CrowdStrike",
            },
            "version": "1.1.0",
        }
        raw_ts = alert.get("timestamp") or alert.get("created_timestamp")
        if raw_ts:
            meta["original_time"] = str(raw_ts)
        ocsf["metadata"] = meta

        # --- time / windows ---
        ocsf["time"] = self.normalize_timestamp(
            alert.get("timestamp") or alert.get("created_timestamp") or alert.get("context_timestamp")
        )
        if alert.get("start_timestamp"):
            ocsf["start_time"] = self.normalize_timestamp(alert["start_timestamp"])
        if alert.get("end_timestamp"):
            ocsf["end_time"] = self.normalize_timestamp(alert["end_timestamp"])

        # --- severity ---
        sev_id, sev_name = map_crowdstrike_severity(alert.get("severity"))
        ocsf["severity_id"] = sev_id
        ocsf["severity"] = sev_name

        # --- confidence ---
        if alert.get("confidence") is not None:
            ocsf["confidence_score"] = int(alert["confidence"])

        # --- status ---
        raw_status = (alert.get("status") or "").lower()
        if raw_status in _STATUS_MAP:
            status_id, status_label = _STATUS_MAP[raw_status]
            ocsf["status"] = status_label
            ocsf["status_id"] = status_id

        # --- device ---
        device_data = alert.get("device", {}) or {}
        device = {}
        if device_data.get("hostname"):
            device["hostname"] = device_data["hostname"]
        if device_data.get("local_ip"):
            device["ip"] = device_data["local_ip"]
        if device_data.get("mac_address"):
            device["mac"] = device_data["mac_address"]

        agent_id = device_data.get("device_id") or device_data.get("agent_id")
        if agent_id:
            device["uid"] = agent_id

        os_version = device_data.get("os_version")
        platform = (device_data.get("platform_name") or "").lower()
        if os_version or platform:
            os_obj = {}
            if os_version:
                os_obj["name"] = os_version
            if platform:
                os_type, os_type_id = _OS_TYPE_MAP.get(platform, (None, None))
                if os_type:
                    os_obj["type"] = os_type
                    os_obj["type_id"] = os_type_id
            if os_obj:
                device["os"] = os_obj

        product_type_desc = device_data.get("product_type_desc")
        if product_type_desc:
            device["type"] = product_type_desc

        agent_version = device_data.get("agent_version")
        if agent_id or agent_version:
            agent_obj = {"name": "Falcon"}
            if agent_id:
                agent_obj["uid"] = agent_id
            if agent_version:
                agent_obj["version"] = agent_version
            device["agent"] = agent_obj

        if device:
            ocsf["device"] = device

        # --- evidences ---
        evidences = []

        # Build process object
        process = {}
        if alert.get("cmdline"):
            process["cmd_line"] = alert["cmdline"]
        file_obj = {}
        if alert.get("filename"):
            file_obj["name"] = alert["filename"]
        if alert.get("filepath"):
            file_obj["path"] = alert["filepath"]
        hashes = []
        sha256 = self.build_hash("SHA-256", alert.get("sha256", ""))
        if sha256:
            hashes.append(sha256)
        md5 = self.build_hash("MD5", alert.get("md5", ""))
        if md5:
            hashes.append(md5)
        if hashes:
            file_obj["hashes"] = hashes
        if file_obj:
            process["file"] = file_obj
        pid = self.safe_int(alert.get("local_process_id"))
        if pid is not None:
            process["pid"] = pid

        # Parent process
        parent = alert.get("parent_details", {}) or {}
        if parent:
            parent_proc = {}
            if parent.get("cmdline"):
                parent_proc["cmd_line"] = parent["cmdline"]
            parent_pid = self.safe_int(parent.get("local_process_id"))
            if parent_pid is not None:
                parent_proc["pid"] = parent_pid
            parent_file = {}
            if parent.get("filename"):
                parent_file["name"] = parent["filename"]
            if parent.get("filepath"):
                parent_file["path"] = parent["filepath"]
            if parent_file:
                parent_proc["file"] = parent_file

            # Grandparent process
            grandparent = alert.get("grandparent_details", {}) or {}
            if grandparent:
                gp_proc = {}
                if grandparent.get("cmdline"):
                    gp_proc["cmd_line"] = grandparent["cmdline"]
                gp_pid = self.safe_int(grandparent.get("local_process_id"))
                if gp_pid is not None:
                    gp_proc["pid"] = gp_pid
                gp_file = {}
                if grandparent.get("filename"):
                    gp_file["name"] = grandparent["filename"]
                if grandparent.get("filepath"):
                    gp_file["path"] = grandparent["filepath"]
                if gp_file:
                    gp_proc["file"] = gp_file
                if gp_proc:
                    parent_proc["parent_process"] = gp_proc

            if parent_proc:
                process["parent_process"] = parent_proc

        # Build user for evidences[].actor.user
        user = {}
        if alert.get("user_name"):
            user["name"] = alert["user_name"]
        if alert.get("logon_domain"):
            user["account"] = {"name": alert["logon_domain"]}

        # Process evidence (process + actor)
        proc_ev = {}
        if process:
            proc_ev["process"] = process
        if user:
            proc_ev["actor"] = {"user": user}
        if proc_ev:
            evidences.append(proc_ev)

        # Network evidence (from network_accesses)
        network_accesses = alert.get("network_accesses") or []
        for na in network_accesses:
            if not isinstance(na, dict):
                continue
            net_ev = {}
            local_addr = na.get("local_address") or na.get("local_ip")
            remote_addr = na.get("remote_address") or na.get("remote_ip")
            local_port = self.safe_int(na.get("local_port"))
            remote_port = self.safe_int(na.get("remote_port"))
            if local_addr:
                src_ep = {"ip": str(local_addr)}
                if local_port:
                    src_ep["port"] = local_port
                net_ev["src_endpoint"] = src_ep
            if remote_addr:
                dst_ep = {"ip": str(remote_addr)}
                if remote_port:
                    dst_ep["port"] = remote_port
                net_ev["dst_endpoint"] = dst_ep
            if net_ev:
                evidences.append(net_ev)

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

        if device.get("ip"):
            add_obs("device.ip", "IP Address", device["ip"])
        if device_data.get("external_ip"):
            add_obs("device.external_ip", "IP Address", device_data["external_ip"])
        if file_obj.get("name"):
            add_obs("evidences[].process.file.name", "File Name", file_obj["name"])
        for h in (file_obj.get("hashes") or []):
            if h.get("algorithm") == "SHA-256":
                add_obs("evidences[].process.file.hashes.SHA-256", "Hash", h["value"])
            elif h.get("algorithm") == "MD5":
                add_obs("evidences[].process.file.hashes.MD5", "Hash", h["value"])

        ioc_value = alert.get("ioc_value")
        ioc_type_raw = (alert.get("ioc_type") or "").lower()
        if ioc_value and ioc_type_raw in _IOC_FIELD_PATH:
            field_path, type_str = _IOC_FIELD_PATH[ioc_type_raw]
            add_obs(field_path, type_str, str(ioc_value))

        for dns_req in (alert.get("dns_requests") or []):
            if isinstance(dns_req, dict) and dns_req.get("domain_name"):
                add_obs("evidences[].dst_endpoint.domain", "Domain", dns_req["domain_name"])

        for na in network_accesses:
            if isinstance(na, dict):
                remote = na.get("remote_address") or na.get("remote_ip")
                if remote:
                    add_obs("evidences[].dst_endpoint.ip", "IP Address", str(remote))

        if observables:
            ocsf["observables"] = observables

        # --- vendor_attributes ---
        raw_sev = alert.get("severity")
        if raw_sev is not None:
            ocsf["vendor_attributes"] = {"severity": raw_sev}

        # --- unmapped ---
        unmapped = {}
        if alert.get("scenario"):
            unmapped["scenario"] = alert["scenario"]
        if alert.get("pattern_id") is not None:
            unmapped["pattern_id"] = alert["pattern_id"]
        if alert.get("data_domains"):
            unmapped["data_domains"] = alert["data_domains"]
        if alert.get("aggregate_id"):
            unmapped["aggregate_id"] = alert["aggregate_id"]
        if alert.get("control_graph_id"):
            unmapped["control_graph_id"] = alert["control_graph_id"]
        if unmapped:
            ocsf["unmapped"] = unmapped

        return self._finalize(ocsf)
