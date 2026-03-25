from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.analytics import Analytic
from app.ocsf.objects.attack import Attack
from app.ocsf.objects.product import Product
class FindingInfo(BaseModel):
    title: str
    uid: str
    desc: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    first_seen_time: Optional[str] = None
    last_seen_time: Optional[str] = None
    src_url: Optional[str] = None
    types: Optional[list[str]] = None
    uid_alt: Optional[str] = None
    data_sources: Optional[list[str]] = None
    analytic: Optional[Analytic] = None
    attacks: Optional[list[Attack]] = None
    product: Optional[Product] = None

    model_config = ConfigDict(extra="forbid")