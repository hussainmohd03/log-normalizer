from pydantic import BaseModel
from typing import Optional

class Account(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[int] = None