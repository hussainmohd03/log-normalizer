"""OCSF Detection Finding required field validation."""

REQUIRED_FIELDS = [
    "activity_id",
    "category_uid",
    "category_name",
    "class_uid",
    "class_name",
    "finding_info",
    "metadata",
    "severity_id",
    "severity",
    "time",
    "type_uid",
]

# Keys forbidden at the OCSF event root — must live inside evidences[] or finding_info
_FORBIDDEN_ROOT_KEYS = {
    "attacks",       # must be finding_info.attacks
    "process",       # must be evidences[].process
    "src_endpoint",  # must be evidences[].src_endpoint
    "dst_endpoint",  # must be evidences[].dst_endpoint
    "user",          # must be device.user or evidences[].actor.user
    "actor",         # must be evidences[].actor
    "connection_info",
    "email",         # must be evidences[].email
}

REQUIRED_FINDING_INFO = ["title", "uid"]
REQUIRED_METADATA_PRODUCT = ["name", "vendor_name"]

VALID_SEVERITY_IDS = {0, 1, 2, 3, 4, 5, 99}
VALID_ACTIVITY_IDS = {0, 1, 2, 3, 99}
VALID_STATUS_IDS = {0, 1, 2, 3, 4, 5, 6, 99}


def validate_ocsf(ocsf: dict) -> list[str]:
    """
    Validate an OCSF Detection Finding dict.
    Returns a list of error strings. Empty list means valid.
    """
    errors = []

    # Required top-level fields
    for field in REQUIRED_FIELDS:
        if field not in ocsf:
            errors.append(f"Missing required field: {field}")

    # Forbidden top-level keys (must live inside evidences[] or finding_info)
    for key in _FORBIDDEN_ROOT_KEYS:
        if key in ocsf:
            errors.append(
                f"Forbidden key at event root: '{key}' — "
                f"use finding_info.attacks or evidences[] instead"
            )

    # finding_info subfields
    fi = ocsf.get("finding_info", {})
    if isinstance(fi, dict):
        for sub in REQUIRED_FINDING_INFO:
            if not fi.get(sub):
                errors.append(f"Missing or empty finding_info.{sub}")
    else:
        errors.append("finding_info must be a dict")

    # metadata subfields
    meta = ocsf.get("metadata", {})
    if isinstance(meta, dict):
        if meta.get("version") != "1.1.0":
            errors.append("metadata.version must be '1.1.0'")
        product = meta.get("product", {})
        if isinstance(product, dict):
            for sub in REQUIRED_METADATA_PRODUCT:
                if not product.get(sub):
                    errors.append(f"Missing or empty metadata.product.{sub}")
        else:
            errors.append("metadata.product must be a dict")
    else:
        errors.append("metadata must be a dict")

    # severity_id range
    sev = ocsf.get("severity_id")
    if sev is not None and sev not in VALID_SEVERITY_IDS:
        errors.append(f"severity_id {sev!r} not in {VALID_SEVERITY_IDS}")

    # activity_id
    act = ocsf.get("activity_id")
    if act is not None and act not in VALID_ACTIVITY_IDS:
        errors.append(f"activity_id {act!r} not in {VALID_ACTIVITY_IDS}")

    # type_uid = class_uid * 100 + activity_id
    if "type_uid" in ocsf and "class_uid" in ocsf and "activity_id" in ocsf:
        expected = ocsf["class_uid"] * 100 + ocsf["activity_id"]
        if ocsf["type_uid"] != expected:
            errors.append(
                f"type_uid {ocsf['type_uid']} != class_uid*100+activity_id ({expected})"
            )

    # time is a non-empty string
    t = ocsf.get("time")
    if not isinstance(t, str) or not t:
        errors.append("time must be a non-empty string")

    # No null/empty fields anywhere
    null_errors = _check_no_nulls(ocsf, "")
    errors.extend(null_errors)

    return errors


def _check_no_nulls(obj, path: str) -> list[str]:
    """Recursively check that no field is None, "", [], or {}."""
    errors = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_path = f"{path}.{k}" if path else k
            if v is None or v == "" or v == [] or v == {}:
                errors.append(f"Null/empty field found: {full_path}")
            else:
                errors.extend(_check_no_nulls(v, full_path))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            full_path = f"{path}[{i}]"
            if item is None or item == "" or item == [] or item == {}:
                errors.append(f"Null/empty item found: {full_path}")
            else:
                errors.extend(_check_no_nulls(item, full_path))
    return errors
