import json
import logging
from app.config import settings
from app.ocsf.ocsf_constants import (
    DETECTION_FINDING_RECOMMENDED, DETECTION_FINDING_REQUIRED,
    DETECTION_FINDING_RICHNESS, COVERAGE_WEIGHTS,
)

logger = logging.getLogger(__name__)

# Required fields for schema_validity scoring
_REQUIRED_TOP = [
    "class_uid", "class_name", "activity_id", "severity_id",
    "time", "type_uid", "finding_info", "metadata",
]
_REQUIRED_NESTED = {
    "finding_info": ["title", "uid"],
    "metadata": ["product"],
    "metadata.product": ["name", "vendor_name"],
}


class ConfidenceResult:
    def __init__(self, score: float, breakdown: dict, decision: str,
                 validation_errors: list[str] | None = None):
        self.score = score
        self.breakdown = breakdown
        self.decision = decision
        self.validation_errors = validation_errors or []


def compute_confidence(
    raw_input: dict,
    ocsf_output: dict,
    source: str,
    validation_errors: list[str] | None = None,
    validation_warnings: list[str] | None = None,
) -> ConfidenceResult:
    """
    Composite score from three signals:
      schema_validity   (0.40) — required fields present + penalty for warnings/errors
      field_coverage    (0.30) — how many expected fields are populated
      value_consistency (0.30) — do output values exist in the input
    """
    schema_score = _score_schema(ocsf_output, validation_errors or [], validation_warnings or [])

    coverage_score = compute_field_coverage(ocsf_output)

    raw_str = json.dumps(raw_input)
    values_to_check = extract_leaf_values(ocsf_output)
    consistent = sum(1 for v in values_to_check if str(v) in raw_str)
    consistency_score = consistent / len(values_to_check) if values_to_check else 0.5

    # Composite
    score = (
        0.40 * schema_score +
        0.30 * coverage_score +
        0.30 * consistency_score
    )

    # Decision
    if score >= settings.accept_threshold:
        decision = "accept"
    elif score >= settings.review_threshold:
        decision = "review"
    else:
        decision = "reject"

    logger.info(
        "[%s] Confidence: %.3f (schema=%.2f, coverage=%.2f, "
        "consistency=%.2f [%d/%d]) → %s",
        source, score, schema_score,
        coverage_score, consistency_score,
        consistent, len(values_to_check),
        decision,
    )

    return ConfidenceResult(
        score=round(score, 3),
        breakdown={
            "schema_validity": round(schema_score, 3),
            "field_coverage": round(coverage_score, 3),
            "value_consistency": round(consistency_score, 3),
        },
        decision=decision,
        validation_errors=(validation_errors or []) + (validation_warnings or []),
    )


def _score_schema(
    ocsf: dict,
    errors: list[str],
    warnings: list[str],
) -> float:
    """
    Proportional schema score based on required field presence.
    Hard errors (missing required / type mismatch) dock heavily.
    Warnings (stripped extras) dock lightly.
    """
    # Count required fields present
    present = sum(1 for f in _REQUIRED_TOP if f in ocsf)
    total = len(_REQUIRED_TOP)

    for parent_path, children in _REQUIRED_NESTED.items():
        parts = parent_path.split(".")
        obj = ocsf
        for p in parts:
            obj = obj.get(p, {}) if isinstance(obj, dict) else {}
        if isinstance(obj, dict):
            present += sum(1 for f in children if f in obj)
        total += len(children)

    base = present / total if total > 0 else 0.0

    error_penalty = min(len(errors) * 0.05, 0.4)
    warning_penalty = min(len(warnings) * 0.02, 0.2)

    return max(0.0, base - error_penalty - warning_penalty)



def compute_field_coverage(data: dict) -> float:
    required_score = _tier_score(data, DETECTION_FINDING_REQUIRED)
    recommended_score = _tier_score(data, DETECTION_FINDING_RECOMMENDED)
    richness_score = _tier_score(data, DETECTION_FINDING_RICHNESS)
    return (
        COVERAGE_WEIGHTS["required"] * required_score
        + COVERAGE_WEIGHTS["recommended"] * recommended_score
        + COVERAGE_WEIGHTS["richness"] * richness_score
    )


def _tier_score(data: dict, fields: list[str]) -> float:
    if not fields:
        return 0.5
    present = count_present_fields(data, fields)
    return present / len(fields)


def count_present_fields(data: dict, expected: list[str]) -> int:
    count = 0
    for path in expected:
        parts = path.split(".")
        obj = data
        found = True
        for part in parts:
            if isinstance(obj, dict) and part in obj:
                obj = obj[part]
            else:
                found = False
                break
        if found and obj is not None:
            count += 1
    return count


def extract_leaf_values(data: dict, max_depth=5) -> list:
    SKIP_INTS = {0, 1, 2, 3, 4, 5, 2004, 200401}
    SKIP_STRS = {"Findings", "Detection Finding", "Create", "1.1.0"}
    values = []

    def _extract(obj, depth=0):
        if depth > max_depth:
            return
        if isinstance(obj, dict):
            for v in obj.values():
                _extract(v, depth + 1)
        elif isinstance(obj, list):
            for v in obj:
                _extract(v, depth + 1)
        elif isinstance(obj, (str, int, float)) and obj not in (None, "", True, False):
            if isinstance(obj, int) and obj in SKIP_INTS:
                return
            if isinstance(obj, str) and (obj in SKIP_STRS or len(obj) < 4):
                return
            if isinstance(obj, (int, float)) and -100 <= obj <= 100:
                return
            values.append(obj)

    _extract(data)
    return values[:50]