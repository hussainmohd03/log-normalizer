from pydantic import BaseModel, ConfigDict
from typing import Optional

class Request(BaseModel):
    data: Optional[dict] = None
    uid: Optional[str] = None

    model_config = ConfigDict(extra="forbid")