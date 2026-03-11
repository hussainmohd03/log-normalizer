from pydantic import ValidationError
from app.ocsf.events.detection_finding import DetectionFinding

class ValidationResult:
    def __init__(self, valid: bool, errors: list[str] = None,
                 nesting_violations: list[str] = None,
                 model: DetectionFinding = None):
        self.valid = valid
        self.errors = errors or []
        self.nesting_violations = nesting_violations or []
        self.model = model

    @property
    def schema_score(self) -> float:
        return 1.0 if self.valid else 0.0

    @property
    def nesting_score(self) -> float:
        return 0.0 if self.nesting_violations else 1.0


def validate_ocsf(data: dict) -> ValidationResult:
    
    # Check nesting first 
    nesting_violations = _check_nesting_violations(data)
    
    # Schema validation
    schema_errors = []
    model = None
    try:
        model = DetectionFinding(**data)
    except ValidationError as e:
        schema_errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
    
    all_errors = nesting_violations + schema_errors
    
    return ValidationResult(
        valid=len(all_errors) == 0,
        errors=all_errors,
        nesting_violations=nesting_violations,
        model=model,
    )

def _check_nesting_violations(data: dict) -> list[str]:

    violations = []
    illegal_top = {"process", "src_endpoint", "dst_endpoint", "attacks", "user"}
    for key in data:
        if key in illegal_top:
            violations.append(
                f"'{key}' at top level — must be inside "
                f"{'finding_info' if key == 'attacks' else 'evidences[]'}"
            )
    return violations