from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.product import Product
from app.ocsf import OCSF_VERSION

class Metadata(BaseModel):
    product: Product
    version: str = OCSF_VERSION
    uid: Optional[str] = None
    correlation_uid: Optional[str] = None
    log_name: Optional[str] = None
    profiles: Optional[list[str]] = None
    original_time: Optional[str] = None
    log_format: Optional[str] = None

    model_config = ConfigDict(extra="ignore")