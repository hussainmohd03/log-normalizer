import logging
from typing import Any

from app.postprocess.lookups.mitre import MITRE_TACTICS, MITRE_TECHNIQUES
from app.postprocess.result import RuleResult


logger = logging.getLogger(__name__)


def _attacks(ocsf: dict[str, Any]) -> list[dict[str, Any]] | None:
    finding_info = ocsf.get("finding_info")
    if not isinstance(finding_info, dict):
        return None
    attacks = finding_info.get("attacks")
    if not isinstance(attacks, list):
        return None
    return attacks


def fix_mitre_technique_names(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    attacks = _attacks(ocsf)
    if not attacks:
        return result

    for attack in attacks:
        if not isinstance(attack, dict):
            continue
        techniques = attack.get("technique")
        candidates = techniques if isinstance(techniques, list) else [techniques]
        for technique in candidates:
            if not isinstance(technique, dict):
                continue
            uid = technique.get("uid")
            if not isinstance(uid, str):
                continue
            canonical = MITRE_TECHNIQUES.get(uid)
            if canonical is None:
                logger.warning("postprocess.mitre: unknown technique uid %s", uid)
                continue
            current = technique.get("name")
            if current != canonical:
                technique["name"] = canonical
                result.fixes.append(
                    f"corrected technique {uid} name: {current!r} -> {canonical!r}"
                )

    return result


def fix_mitre_tactic_names(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    attacks = _attacks(ocsf)
    if not attacks:
        return result

    for attack in attacks:
        if not isinstance(attack, dict):
            continue
        tactics = attack.get("tactic") or attack.get("tactics")
        if isinstance(tactics, dict):
            tactics_list = [tactics]
        elif isinstance(tactics, list):
            tactics_list = tactics
        else:
            continue

        for tactic in tactics_list:
            if not isinstance(tactic, dict):
                continue
            uid = tactic.get("uid")
            if not isinstance(uid, str):
                continue
            canonical = MITRE_TACTICS.get(uid)
            if canonical is None:
                logger.warning("postprocess.mitre: unknown tactic uid %s", uid)
                continue
            current = tactic.get("name")
            if current != canonical:
                tactic["name"] = canonical
                result.fixes.append(
                    f"corrected tactic {uid} name: {current!r} -> {canonical!r}"
                )

    return result


def run_mitre_rules(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    result.merge(fix_mitre_technique_names(ocsf))
    result.merge(fix_mitre_tactic_names(ocsf))
    return result
