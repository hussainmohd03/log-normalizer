from pydantic import BaseModel
from typing import Optional

class Technique(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None