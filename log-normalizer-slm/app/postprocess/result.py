from dataclasses import dataclass, field
from typing import Any


@dataclass
class RuleResult:
    """One rule's contribution to the post-process pass.

    Rules return this so the pipeline can decide which list each message
    belongs in (fixes vs hallucinations) without leaking that decision
    into every rule body.
    """

    fixes: list[str] = field(default_factory=list)
    hallucinations: list[str] = field(default_factory=list)

    def merge(self, other: "RuleResult") -> None:
        self.fixes.extend(other.fixes)
        self.hallucinations.extend(other.hallucinations)


@dataclass
class PostProcessResult:
    """The full output of PostProcessor.process().

    cleaned_ocsf is the mutated OCSF dict ready to hand to validate_ocsf.
    fixes_applied collects every "we corrected this" message in order.
    hallucinations_stripped collects every "we removed this fabricated
    field" message; the count of these is what feeds the confidence
    docking in Phase 6.
    """

    cleaned_ocsf: dict[str, Any]
    fixes_applied: list[str] = field(default_factory=list)
    hallucinations_stripped: list[str] = field(default_factory=list)

    def absorb(self, rule: RuleResult) -> None:
        self.fixes_applied.extend(rule.fixes)
        self.hallucinations_stripped.extend(rule.hallucinations)
