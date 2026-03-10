from pydantic import BaseModel, field_validator
from typing import Optional

from objects.resource_details import ResourceDetails
from ocsf.objects.finding_info import FindingInfo
from ocsf.objects.metadata import Metadata
from objects.observable import Observable
from objects.evidence import Evidence
from objects.device import Device
class DetectionFinding(BaseModel):
    # Required
    activity_id: int
    activity_name: Optional[str] = None
    category_uid: int = 2
    category_name: str = "Findings"
    class_uid: int = 2004
    class_name: str = "Detection Finding"
    type_uid: int
    finding_info: FindingInfo
    metadata: Metadata
    severity_id: int
    time: str

    # Classification & scoring
    severity: Optional[str] = None
    confidence_score: Optional[int] = None
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    risk_level_id: Optional[int] = None
    impact_score: Optional[int] = None

    # Status
    status: Optional[str] = None
    status_id: Optional[int] = None
    status_detail: Optional[str] = None
    status_code: Optional[str] = None

    # Context
    message: Optional[str] = None
    comment: Optional[str] = None
    count: Optional[int] = None
    is_alert: Optional[bool] = None

    # Timing
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration: Optional[int] = None

    # Objects
    device: Optional[Device] = None
    evidences: Optional[list[Evidence]] = None
    observables: Optional[list[Observable]] = None
    resources: Optional[list[ResourceDetails]] = None
    enrichments: Optional[list[Enrichment]] = None
    vendor_attributes: Optional[dict] = None

    # Data
    unmapped: Optional[dict] = None
    raw_data: Optional[str] = None

    model_config = {"populate_by_name": True}

    @field_validator("class_uid")
    @classmethod
    def must_be_2004(cls, v):
        if v != 2004:
            raise ValueError(f"class_uid must be 2004, got {v}")
        return v

    @field_validator("category_uid")
    @classmethod
    def must_be_findings(cls, v):
        if v != 2:
            raise ValueError(f"category_uid must be 2, got {v}")
        return v

