from typing import Any

from app.postprocess.result import RuleResult


_ROOT_FIELDS_MISPLACED_IN_FINDING_INFO = (
    "severity_id",
    "severity",
    "status",
    "status_id",
    "time",
    "start_time",
    "end_time",
)


_INVENTED_METADATA_FIELDS = ("created_time", "modified_time")


def move_root_fields_from_finding_info(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    finding_info = ocsf.get("finding_info")
    if not isinstance(finding_info, dict):
        return result

    for field in _ROOT_FIELDS_MISPLACED_IN_FINDING_INFO:
        if field not in finding_info:
            continue
        if field in ocsf:
            del finding_info[field]
            result.fixes.append(
                f"dropped duplicate finding_info.{field} (root value kept)"
            )
        else:
            ocsf[field] = finding_info.pop(field)
            result.fixes.append(f"moved finding_info.{field} to root")

    return result


def fix_evidence_network_nesting(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    evidences = ocsf.get("evidences")
    if not isinstance(evidences, list):
        return result

    for idx, evidence in enumerate(evidences):
        if not isinstance(evidence, dict):
            continue
        network = evidence.get("network")
        if not isinstance(network, dict):
            continue

        if "src_endpoint" in network and "src_endpoint" not in evidence:
            evidence["src_endpoint"] = network.pop("src_endpoint")
            result.fixes.append(
                f"flattened evidences[{idx}].network.src_endpoint"
            )

        del evidence["network"]
        result.fixes.append(f"stripped evidences[{idx}].network wrapper")

    return result


def move_device_account_to_owner(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    device = ocsf.get("device")
    if not isinstance(device, dict):
        return result
    if "account" not in device:
        return result

    account = device.pop("account")
    owner = device.get("owner")
    if not isinstance(owner, dict):
        owner = {}
        device["owner"] = owner

    if "account" not in owner:
        owner["account"] = account
        result.fixes.append("moved device.account to device.owner.account")
    else:
        result.fixes.append(
            "dropped device.account (device.owner.account already set)"
        )

    return result


def strip_metadata_invented_fields(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    metadata = ocsf.get("metadata")
    if not isinstance(metadata, dict):
        return result

    for field in _INVENTED_METADATA_FIELDS:
        if field in metadata:
            del metadata[field]
            result.fixes.append(f"stripped metadata.{field}")

    return result


def fill_time_from_start_time(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    if "time" in ocsf and ocsf["time"] is not None:
        return result
    start_time = ocsf.get("start_time")
    if start_time is None:
        return result
    ocsf["time"] = start_time
    result.fixes.append("set time from start_time")
    return result


def normalize_device_agent_to_list(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    device = ocsf.get("device")
    if not isinstance(device, dict):
        return result
    agent = device.get("agent")
    if agent is None or isinstance(agent, list):
        return result
    if isinstance(agent, dict):
        device["agent"] = [agent]
        result.fixes.append("wrapped device.agent in list")
    return result


def run_structural_rules(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    result.merge(move_root_fields_from_finding_info(ocsf))
    result.merge(fix_evidence_network_nesting(ocsf))
    result.merge(move_device_account_to_owner(ocsf))
    result.merge(strip_metadata_invented_fields(ocsf))
    result.merge(fill_time_from_start_time(ocsf))
    result.merge(normalize_device_agent_to_list(ocsf))
    return result
