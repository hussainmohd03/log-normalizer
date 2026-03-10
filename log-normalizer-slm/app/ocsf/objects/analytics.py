from pydantic import BaseModel
from typing import Optional

class Analytic(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[int] = None
    uid: Optional[str] = None
