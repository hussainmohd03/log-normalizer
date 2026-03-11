# Used by confidence_scorer.compute_field_coverage()
#
# Three tiers: required (must exist), recommended (should exist),
# richness (bonus quality signals).
#
# These are dotted paths into the OCSF output dict.

DETECTION_FINDING_REQUIRED: list[str] = [
    "activity_id",
    "category_uid",
    "class_uid",
    "class_name",
    "type_uid",
    "finding_info",
    "finding_info.title",
    "finding_info.uid",
    "metadata",
    "metadata.product",
    "metadata.product.name",
    "metadata.product.vendor_name",
    "severity_id",
    "time",
]

DETECTION_FINDING_RECOMMENDED: list[str] = [
    "finding_info.desc",
    "finding_info.created_time",
    "finding_info.attacks",
    "finding_info.analytic",
    "finding_info.src_url",
    "activity_name",
    "severity",
    "status",
    "is_alert",
]

DETECTION_FINDING_RICHNESS: list[str] = [
    "device",
    "device.hostname",
    "device.ip",
    "device.uid",
    "device.owner",
    "device.os",
    "evidences",
    "observables",
    "resources",
    "enrichments",
    "malware",
    "start_time",
    "end_time",
    "unmapped",
    "risk_score",
    "risk_level_id",
    "confidence_score",
    "impact_score",
    "message",
    "type_name",
]


# -- Field Coverage Weights ------------------------------------------------
# How much each tier contributes to the coverage score.

COVERAGE_WEIGHTS: dict[str, float] = {
    "required": 0.50,
    "recommended": 0.30,
    "richness": 0.20,
}