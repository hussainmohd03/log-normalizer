import re
from typing import Any

from app.postprocess.lookups.observable_types import lookup_observable_type
from app.postprocess.result import RuleResult


_IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
_HASH_RE = re.compile(r"^[a-fA-F0-9]{32,128}$")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_DOMAIN_RE = re.compile(r"^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$")

_PLACEHOLDER_RE = re.compile(
    r"^(unknown|n/?a|unspecified|none|null|tbd)$", re.IGNORECASE
)

_PORT_FIELD_NAMES = frozenset({
    "port", "src_port", "dst_port", "local_port", "remote_port",
})


def _infer_observable_type_from_value(
    value: Any, name: str | None = None,
) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    if _IPV4_RE.match(value):
        return "IP Address"
    if _HASH_RE.match(value):
        return "Hash"
    if _EMAIL_RE.match(value):
        return "Email Address"
    if value.isdigit():
        port_name = (name or "").strip().lower()
        if port_name in _PORT_FIELD_NAMES:
            return "Port"
        return None
    if _DOMAIN_RE.match(value):
        return "Hostname"
    return None


def fix_observable_types(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    observables = ocsf.get("observables")
    if not isinstance(observables, list):
        return result

    for idx, obs in enumerate(observables):
        if not isinstance(obs, dict):
            continue

        old_type = obs.get("type")
        canonical_type: str | None = None
        canonical_id: int | None = None

        if isinstance(old_type, str):
            hit = lookup_observable_type(old_type)
            if hit is not None:
                canonical_id, canonical_type = hit
            elif old_type.lower() in ("string", "str", "int", "integer"):
                inferred = _infer_observable_type_from_value(
                    obs.get("value"), obs.get("name"),
                )
                if inferred:
                    hit = lookup_observable_type(inferred)
                    if hit is not None:
                        canonical_id, canonical_type = hit

        if canonical_type is None:
            continue

        if obs.get("type") != canonical_type:
            obs["type"] = canonical_type
            result.fixes.append(
                f"fixed observables[{idx}].type {old_type!r} -> {canonical_type!r}"
            )
        if obs.get("type_id") != canonical_id:
            obs["type_id"] = canonical_id
            result.fixes.append(
                f"set observables[{idx}].type_id to {canonical_id}"
            )

    return result


def fix_email_to_list(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    evidences = ocsf.get("evidences")
    if not isinstance(evidences, list):
        return result

    for idx, evidence in enumerate(evidences):
        if not isinstance(evidence, dict):
            continue
        email = evidence.get("email")
        if not isinstance(email, dict):
            continue
        to = email.get("to")
        if isinstance(to, str):
            email["to"] = [to]
            result.fixes.append(f"wrapped evidences[{idx}].email.to as list")

    return result


def fix_email_from_string(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    evidences = ocsf.get("evidences")
    if not isinstance(evidences, list):
        return result

    for idx, evidence in enumerate(evidences):
        if not isinstance(evidence, dict):
            continue
        email = evidence.get("email")
        if not isinstance(email, dict):
            continue
        from_value = email.get("from")
        if isinstance(from_value, dict) and "email" in from_value:
            email["from"] = from_value["email"]
            result.fixes.append(
                f"flattened evidences[{idx}].email.from to string"
            )

    return result


def fix_process_pid_int(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    evidences = ocsf.get("evidences")
    if not isinstance(evidences, list):
        return result

    for idx, evidence in enumerate(evidences):
        if not isinstance(evidence, dict):
            continue
        process = evidence.get("process")
        if not isinstance(process, dict):
            continue
        pid = process.get("pid")
        if pid is None:
            continue
        if isinstance(pid, bool):
            del process["pid"]
            result.fixes.append(
                f"dropped evidences[{idx}].process.pid (non-numeric)"
            )
            continue
        if isinstance(pid, int):
            continue
        if isinstance(pid, str) and pid.strip().isdigit():
            process["pid"] = int(pid.strip())
            result.fixes.append(
                f"coerced evidences[{idx}].process.pid string -> int"
            )
            continue
        del process["pid"]
        result.fixes.append(
            f"dropped evidences[{idx}].process.pid (non-numeric)"
        )

    return result


def strip_device_os_string(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    device = ocsf.get("device")
    if not isinstance(device, dict):
        return result
    os_value = device.get("os")
    if os_value is None:
        return result
    if isinstance(os_value, dict):
        return result
    del device["os"]
    result.fixes.append("dropped device.os (was string not object)")
    return result


def _strip_placeholders_recursive(
    obj: Any, path: str, removed: list[str],
) -> Any:
    if isinstance(obj, dict):
        keys_to_remove: list[str] = []
        for k, v in obj.items():
            child_path = f"{path}.{k}" if path else k
            if isinstance(v, str) and _PLACEHOLDER_RE.match(v.strip()):
                keys_to_remove.append(k)
                removed.append(f"stripped placeholder {child_path}")
            else:
                obj[k] = _strip_placeholders_recursive(v, child_path, removed)
        for k in keys_to_remove:
            del obj[k]
        return obj
    if isinstance(obj, list):
        for idx, item in enumerate(obj):
            child_path = f"{path}[{idx}]"
            obj[idx] = _strip_placeholders_recursive(item, child_path, removed)
        return obj
    return obj


def strip_placeholder_values(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    for section in ("evidences", "metadata"):
        target = ocsf.get(section)
        if target is None:
            continue
        _strip_placeholders_recursive(target, section, result.fixes)
    return result


def run_field_fix_rules(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    result.merge(fix_observable_types(ocsf))
    result.merge(fix_email_to_list(ocsf))
    result.merge(fix_email_from_string(ocsf))
    result.merge(fix_process_pid_int(ocsf))
    result.merge(strip_device_os_string(ocsf))
    result.merge(strip_placeholder_values(ocsf))
    return result
