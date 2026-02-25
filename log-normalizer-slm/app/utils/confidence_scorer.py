"""
produce a float 0.0–1.0 representing output quality. This score drives routing: below settings.confidence_threshold → manual review queue.
"""
from app.schemas.ocsf_types import (
    CLASS_REQUIRED_FIELDS,
    VALID_CLASS_UID_SET,
    TYPE_UID_MULTIPLIER,
)


def score_confidence(ocsf: dict) -> float:
    score = 0.0

    # --- Signal 1: Required base fields (weight: 0.40) ---
    per_field_contribution = 0.40 / 3  # ~0.133 per field
    for field in ("class_uid", "class_name", "metadata"):
        if ocsf.get(field) is not None:
            score += per_field_contribution

    # --- Resolve class_uid to int (coerce strings for downstream signals) ---
    raw_class_uid = ocsf.get("class_uid")
    class_uid_is_int = isinstance(raw_class_uid, int) and not isinstance(raw_class_uid, bool)

    class_uid_int: int | None = None
    if class_uid_is_int:
        class_uid_int = raw_class_uid
    elif isinstance(raw_class_uid, str):
        try:
            class_uid_int = int(raw_class_uid)
        except ValueError:
            pass

    class_uid_valid = class_uid_int is not None and class_uid_int in VALID_CLASS_UID_SET

    # --- Signal 2: type_uid formula correctness (weight: 0.20) ---
    activity_id = ocsf.get("activity_id")
    type_uid = ocsf.get("type_uid")

    if activity_id is None:
        # partial credit — some event classes don't require activity_id
        score += 0.10
    elif class_uid_valid and type_uid is not None:
        expected_type_uid = class_uid_int * TYPE_UID_MULTIPLIER + activity_id  # type: ignore[operator]
        score += 0.20 if type_uid == expected_type_uid else 0.0
    # else: unknown class_uid or missing type_uid with activity_id present → 0

    # --- Signal 3: Class-specific required fields (weight: 0.25) ---
    if class_uid_int is not None and class_uid_int in CLASS_REQUIRED_FIELDS:
        required_fields = CLASS_REQUIRED_FIELDS[class_uid_int]
        if required_fields:
            present = sum(1 for f in required_fields if ocsf.get(f) is not None)
            score += 0.25 * (present / len(required_fields))
        else:
            score += 0.25  # class known, no specific fields required
    # else: class_uid unknown or not in CLASS_REQUIRED_FIELDS → 0

    # --- Signal 4: Type correctness of key fields (weight: 0.15) ---
    if class_uid_is_int and class_uid_valid:
        signal4 = 0.15
        severity_id = ocsf.get("severity_id")
        if severity_id is not None:
            is_valid_severity = (
                isinstance(severity_id, int)
                and not isinstance(severity_id, bool)
                and 0 <= severity_id <= 5
            )
            if not is_valid_severity:
                signal4 -= 0.05  # small deduction for out-of-range severity_id
        score += signal4
    # else: string class_uid (wrong type) or invalid class_uid value → 0

    # --- Extra penalty: class_uid present but not a valid OCSF class UID ---
    if raw_class_uid is not None and not class_uid_valid:
        score -= 0.10

    return max(0.0, min(1.0, score))