"""Stage 1 rules: structural fixes (no raw alert, no vendor lookups).

These rules reshape the OCSF dict to match the schema's intended layout.
Implementations land in Phase 3.
"""

from typing import Any

from app.postprocess.result import RuleResult


def run_structural_rules(ocsf: dict[str, Any]) -> RuleResult:
    return RuleResult()
