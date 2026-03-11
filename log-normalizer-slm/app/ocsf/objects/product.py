from pydantic import BaseModel, ConfigDict
from typing import Optional

class Product(BaseModel):
    name: str
    vendor_name: str
    uid: Optional[str] = None
    version: Optional[str] = None

    model_config = ConfigDict(extra="forbid")