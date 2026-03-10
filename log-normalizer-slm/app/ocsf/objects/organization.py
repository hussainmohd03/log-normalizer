from pydantic import BaseModel
from typing import Optional

class Organization(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None