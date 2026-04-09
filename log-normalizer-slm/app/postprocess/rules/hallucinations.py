from typing import Any

from app.postprocess.result import RuleResult


def run_hallucination_rules(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    return RuleResult()
