from pydantic import BaseModel, ConfigDict
from typing import Optional

class Agent(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None
    version: Optional[str] = None
    type: Optional[str] = None

    model_config = ConfigDict(extra="forbid")