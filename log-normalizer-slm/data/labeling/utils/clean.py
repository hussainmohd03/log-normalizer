"""Recursively strip null/empty fields from OCSF output."""


def strip_nulls(obj):
    """
    Recursively remove null, empty string, empty list, and empty dict fields.
    Returns a new object with all such fields omitted.
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            cleaned_v = strip_nulls(v)
            if cleaned_v is not None and cleaned_v != "" and cleaned_v != [] and cleaned_v != {}:
                cleaned[k] = cleaned_v
        return cleaned
    elif isinstance(obj, list):
        cleaned = [strip_nulls(item) for item in obj]
        cleaned = [item for item in cleaned if item is not None and item != "" and item != [] and item != {}]
        return cleaned
    else:
        return obj
