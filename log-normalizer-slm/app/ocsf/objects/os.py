from pydantic import BaseModel
from typing import Optional

class OS(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[int] = None
    version: Optional[str] = None