from pydantic import BaseModel
from typing import Optional

class Service(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None
