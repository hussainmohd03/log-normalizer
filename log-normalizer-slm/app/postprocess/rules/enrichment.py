from typing import Any

from app.postprocess.result import RuleResult


def run_enrichment_rules(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
    source: str,
) -> RuleResult:
    return RuleResult()
