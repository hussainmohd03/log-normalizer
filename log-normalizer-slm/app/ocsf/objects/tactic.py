from pydantic import BaseModel
from typing import Optional

class Tactic(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None