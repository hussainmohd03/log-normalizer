import logging
from pydantic import ValidationError
from app.ocsf.events.detection_finding import DetectionFinding

logger = logging.getLogger(__name__)


class ValidationResult:
    def __init__(self, valid: bool, errors: list[str] | None = None,
                 warnings: list[str] | None= None, model: DetectionFinding | None= None,
                 cleaned: dict | None = None):
        self.valid = valid
        self.errors = errors or []
        self.warnings = warnings or []
        self.model = model
        self.cleaned = cleaned


def validate_ocsf(data: dict, source: str = "unknown") -> ValidationResult:
    """
    Two-tier validation:
      - Pydantic with extra="ignore" strips unknown fields (warnings)
      - Missing required / type mismatches are hard errors
    Always returns cleaned dict when possible.
    """
    if not isinstance(data, dict):
        msg = f"Expected dict, got {type(data).__name__}"
        logger.warning("[%s] Validation failed: %s", source, msg)
        return ValidationResult(valid=False, errors=[msg])

    try:
        model = DetectionFinding(**data)
        cleaned = model.model_dump(exclude_none=True)

        # Detect what Pydantic stripped
        warnings = _find_stripped_fields(data, cleaned)
        if warnings:
            logger.info("[%s] Stripped %d extra fields: %s",
                        source, len(warnings), warnings[:5])

        return ValidationResult(
            valid=True, model=model,
            cleaned=cleaned, warnings=warnings,
        )

    except ValidationError as e:
        errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
        logger.warning("[%s] Validation failed with %d errors: %s",
                       source, len(errors), errors[:3])
        return ValidationResult(valid=False, errors=errors)

    except Exception as e:
        msg = f"Unexpected validation error: {e}"
        logger.error("[%s] %s", source, msg, exc_info=True)
        return ValidationResult(valid=False, errors=[msg])


def _find_stripped_fields(original: dict, cleaned: dict, prefix: str = "") -> list[str]:
    """Recursively finds fields in original that aren't in cleaned output."""
    stripped = []
    for key in original:
        path = f"{prefix}.{key}" if prefix else key
        if key not in cleaned:
            stripped.append(path)
        elif isinstance(original[key], dict) and isinstance(cleaned.get(key), dict):
            stripped.extend(_find_stripped_fields(original[key], cleaned[key], path))
    return stripped