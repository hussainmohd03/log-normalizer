import logging
from pydantic import ValidationError
from app.ocsf.events.detection_finding import DetectionFinding

logger = logging.getLogger(__name__)


class ValidationResult:
    def __init__(self, valid: bool, errors: list[str] = None,
                 model: DetectionFinding = None):
        self.valid = valid
        self.errors = errors or []
        self.model = model

    @property
    def schema_score(self) -> float:
        return 1.0 if self.valid else 0.0


def validate_ocsf(data, source: str = "unknown") -> ValidationResult:
    """
    Validate model output against Detection Finding 2004 schema.
    Never raises — always returns a ValidationResult.
    """
    if not isinstance(data, dict):
        msg = f"Expected dict, got {type(data).__name__}"
        logger.warning("[%s] Validation failed: %s", source, msg)
        return ValidationResult(valid=False, errors=[msg])

    try:
        model = DetectionFinding(**data)
        logger.info("[%s] Validation passed", source)
        return ValidationResult(valid=True, model=model)

    except ValidationError as e:
        errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
        logger.warning(
            "[%s] Validation failed with %d errors: %s",
            source, len(errors), errors[:3],  
        )
        return ValidationResult(valid=False, errors=errors)

    except Exception as e:
        msg = f"Unexpected validation error: {e}"
        logger.error("[%s] %s", source, msg, exc_info=True)
        return ValidationResult(valid=False, errors=[msg])