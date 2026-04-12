import re
from typing import Any

from app.postprocess.result import RuleResult


_MITRE_PATTERN = re.compile(
    r"\bT\d{4}(?:\.\d{3})?\b|\bTA\d{4}\b|att&ck|mitre",
    re.IGNORECASE,
)

_OS_KEYS = {"os", "osplatform", "osversion", "operatingsystem", "os_name", "os_type"}
_OS_VALUE_PATTERN = re.compile(
    r"\b(windows|linux|macos|mac\s*os|android|ios|ubuntu|debian|centos|rhel|fedora|aix|solaris)\b",
    re.IGNORECASE,
)


def _walk(obj: Any):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield "key", k
            yield from _walk(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk(item)
    elif isinstance(obj, str):
        yield "value", obj
    elif obj is not None:
        yield "value", str(obj)


def _raw_has_mitre_reference(raw_alert: dict[str, Any]) -> bool:
    for kind, item in _walk(raw_alert):
        if _MITRE_PATTERN.search(item):
            return True
    return False


def _raw_has_os_reference(raw_alert: dict[str, Any]) -> bool:
    for kind, item in _walk(raw_alert):
        if kind == "key" and item.lower() in _OS_KEYS:
            return True
        if kind == "value" and _OS_VALUE_PATTERN.search(item):
            return True
    return False


def _raw_contains_substring(raw_alert: dict[str, Any], needle: str) -> bool:
    if not needle:
        return False
    needle_lower = needle.lower()
    for _, item in _walk(raw_alert):
        if needle_lower in item.lower():
            return True
    return False


def _has_tactic_as_technique(attack: dict[str, Any]) -> bool:
    technique = attack.get("technique")
    if isinstance(technique, dict):
        uid = technique.get("uid", "")
        if isinstance(uid, str) and uid.startswith("TA"):
            return True
    return False


def strip_hallucinated_mitre(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    result = RuleResult()
    finding_info = ocsf.get("finding_info")
    if not isinstance(finding_info, dict):
        return result
    attacks = finding_info.get("attacks")
    if not isinstance(attacks, list) or not attacks:
        return result

    has_mitre = _raw_has_mitre_reference(raw_alert)

    if not has_mitre:
        del finding_info["attacks"]
        result.hallucinations.append(
            "stripped hallucinated finding_info.attacks "
            "(raw alert has no MITRE references)"
        )
        return result

    cleaned = [a for a in attacks if not _has_tactic_as_technique(a)]
    stripped_count = len(attacks) - len(cleaned)
    if stripped_count:
        finding_info["attacks"] = cleaned if cleaned else None
        if not cleaned:
            del finding_info["attacks"]
        for _ in range(stripped_count):
            result.hallucinations.append(
                "stripped attack with tactic UID used as technique"
            )

    return result


def strip_hallucinated_os(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    result = RuleResult()
    device = ocsf.get("device")
    if not isinstance(device, dict):
        return result
    if "os" not in device or device["os"] is None:
        return result

    if _raw_has_os_reference(raw_alert):
        return result

    del device["os"]
    result.hallucinations.append(
        "stripped hallucinated device.os (raw alert has no OS references)"
    )
    return result


def strip_hallucinated_hostname(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    result = RuleResult()
    device = ocsf.get("device")
    if not isinstance(device, dict):
        return result
    hostname = device.get("hostname")
    if not isinstance(hostname, str) or not hostname:
        return result

    if "@" in hostname:
        device["hostname"] = None
        result.hallucinations.append(
            f"stripped hallucinated device.hostname (looks like email): {hostname}"
        )
        return result

    if not _raw_contains_substring(raw_alert, hostname):
        device["hostname"] = None
        result.hallucinations.append(
            f"stripped hallucinated device.hostname (not in raw alert): {hostname}"
        )

    return result


def run_hallucination_rules(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    result = RuleResult()
    result.merge(strip_hallucinated_mitre(ocsf, raw_alert))
    result.merge(strip_hallucinated_os(ocsf, raw_alert))
    result.merge(strip_hallucinated_hostname(ocsf, raw_alert))
    return result
