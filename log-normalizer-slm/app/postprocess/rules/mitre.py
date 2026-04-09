"""Stage 4 rules: MITRE ATT&CK technique and tactic name normalization."""

from typing import Any

from app.postprocess.result import RuleResult


def run_mitre_rules(ocsf: dict[str, Any]) -> RuleResult:
    return RuleResult()
