from pydantic import BaseModel, ConfigDict
from typing import Optional

class Tactic(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None

    model_config = ConfigDict(extra="ignore")