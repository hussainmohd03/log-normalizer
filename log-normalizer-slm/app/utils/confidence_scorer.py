"""
produce a float 0.0–1.0 representing output quality. This score drives routing: below settings.confidence_threshold -> manual review queue.
"""

from ..schemas.ocsf_types import (
    VALID_CLASS_UID_SET,
    CLASS_REQUIRED_FIELDS,
    TYPE_UID_MULTIPLIER,
    BASE_REQUIRED_FIELDS,
    VALID_SEVERITY_IDS
)

def score_confidence(ocsf: dict) -> float:
    score = 0
    base_weight = 0.4               # require base fields weight more heavily since they are fundamental to OCSF structure
    class_weight = 0.25             # class_uid and class-specific fields are next most important since they determine the event's category and essential details
    type_formula_weight = 0.2       # type_uid is important but can be derived from class_uid, so it gets slightly less weight
    field_correctness_weight = 0.15 # type correctness of key fields 

    # -- Check for base required fields --
    for field in BASE_REQUIRED_FIELDS:
        if field in ocsf:
            score += (base_weight / len(BASE_REQUIRED_FIELDS))  

    # -- Check for valid class_uid --
    class_uid = ocsf.get("class_uid")
    if class_uid in VALID_CLASS_UID_SET:
        for field in CLASS_REQUIRED_FIELDS.get(class_uid, []):
            if field in ocsf:
                score += (class_weight / len(CLASS_REQUIRED_FIELDS.get(class_uid, []))) 


    # -- Check type_uid formula --
    type_uid = ocsf.get("type_uid")
    if class_uid and type_uid:
        if type_uid // TYPE_UID_MULTIPLIER == class_uid:
            score += type_formula_weight
    
    # -- type correctness of key fields --
    severity_id = ocsf.get("severity_id")
    if severity_id is not None and severity_id in VALID_SEVERITY_IDS:
        score += field_correctness_weight


    return min(score, 1.0)

