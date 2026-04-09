from dataclasses import dataclass, field
from typing import Any


@dataclass
class RuleResult:
    fixes: list[str] = field(default_factory=list)
    hallucinations: list[str] = field(default_factory=list)

    def merge(self, other: "RuleResult") -> None:
        self.fixes.extend(other.fixes)
        self.hallucinations.extend(other.hallucinations)


@dataclass
class PostProcessResult:
    cleaned_ocsf: dict[str, Any]
    fixes_applied: list[str] = field(default_factory=list)
    hallucinations_stripped: list[str] = field(default_factory=list)

    def absorb(self, rule: RuleResult) -> None:
        self.fixes_applied.extend(rule.fixes)
        self.hallucinations_stripped.extend(rule.hallucinations)
