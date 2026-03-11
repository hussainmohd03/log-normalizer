from pydantic import BaseModel
from typing import Optional

from ocsf.objects.product import Product

class CWE(BaseModel):
    uid: str
    caption: Optional[str] = None
    src_url: Optional[str] = None

    model_config = {"extra": "forbid"}


class CVSSScore(BaseModel):
    version: Optional[str] = None
    base_score: Optional[float] = None
    severity: Optional[str] = None

    model_config = {"extra": "forbid"}


class EPSS(BaseModel):
    score: Optional[float] = None
    percentile: Optional[float] = None

    model_config = {"extra": "forbid"}

class CVE(BaseModel):
    uid: str
    title: Optional[str] = None
    desc: Optional[str] = None
    type: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    cvss: Optional[list[CVSSScore]] = None
    epss: Optional[EPSS] = None
    product: Optional[Product] = None
    references: Optional[list[str]] = None
    related_cwes: Optional[list[CWE]] = None

    model_config = {"extra": "forbid"}

