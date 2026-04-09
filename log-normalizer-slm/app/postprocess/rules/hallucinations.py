"""Stage 5 rules: hallucination guards (require the raw alert).

Anything stripped here counts toward the post-process penalty applied
by the confidence scorer in Phase 6.
"""

from typing import Any

from app.postprocess.result import RuleResult


def run_hallucination_rules(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    return RuleResult()
