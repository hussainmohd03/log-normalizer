import json
import logging
from app.ocsf.validator import validate_ocsf
from app.config import settings
from app.ocsf.ocsf_constants import (DETECTION_FINDING_RECOMMENDED, DETECTION_FINDING_REQUIRED, DETECTION_FINDING_RICHNESS, COVERAGE_WEIGHTS)

logger = logging.getLogger(__name__)



class ConfidenceResult:
    def __init__(self, score: float, breakdown: dict, decision: str,
                 validation_errors: list[str] = None):
        self.score = score
        self.breakdown = breakdown
        self.decision = decision # "accept", "review", "reject"
        self.validation_errors = validation_errors or []

def compute_confidence(raw_input: dict, ocsf_output: dict, source: str) -> ConfidenceResult:
    """
    Composite score from three signals:
      schema_validity   (0.40 weight) — passes Pydantic validation?
      field_coverage    (0.30 weight) — how many expected fields are present?
      value_consistency (0.30 weight) — do output values exist in the input?
    """

    # 1. Schema validity
    validation = validate_ocsf(ocsf_output)
    schema_score = validation.schema_score

    # 2. Field coverage 
    coverage_score = compute_field_coverage(ocsf_output)

    # 3. Value consistency — do extracted values appear in raw input?
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
        decision=decision
    )


def compute_field_coverage(data: dict) -> float:
    """
    Measure how densely populated the OCSF output is.
    Uses tiered field lists from ocsf_constants.
    """
    required_score = _tier_score(data, DETECTION_FINDING_REQUIRED)
    recommended_score = _tier_score(data, DETECTION_FINDING_RECOMMENDED)
    richness_score = _tier_score(data, DETECTION_FINDING_RICHNESS)

    return (
        COVERAGE_WEIGHTS["required"] * required_score
        + COVERAGE_WEIGHTS["recommended"] * recommended_score
        + COVERAGE_WEIGHTS["richness"] * richness_score
    )


def _tier_score(data: dict, fields: list[str]) -> float:
    """Ratio of present fields to total fields in a tier."""
    if not fields:
        return 0.5
    present = count_present_fields(data, fields)
    return present / len(fields)


def count_present_fields(data: dict, expected: list[str]) -> int:
    """Count how many expected dotted field paths are present."""
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
    """Extract all scalar values from nested dict for consistency check."""
    SKIP_INTS = {0, 1, 2, 3, 4, 5, 2004, 200401}
    SKIP_STRS = {"Findings", "Detection Finding", "Create", "1.7.0"}

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
            # Skip common constants that would match everywhere
            if isinstance(obj, int) and obj in SKIP_INTS:
                return
            if isinstance(obj, str) and (obj in SKIP_STRS or len(obj) < 4):
                return
            if isinstance(obj, (int, float)) and -100 <= obj <= 100:
                return
            values.append(obj)

    _extract(data)
    return values[:50]  # Cap to avoid slow checks on huge outputs