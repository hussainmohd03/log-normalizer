from pydantic import BaseModel
from typing import Optional

class Enrichment(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    type: Optional[str] = None
    provider: Optional[str] = None
    data: Optional[dict] = None
    desc: Optional[str] = None