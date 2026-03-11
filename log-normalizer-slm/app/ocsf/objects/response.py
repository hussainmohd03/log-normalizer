from pydantic import BaseModel, ConfigDict
from typing import Optional

class Response(BaseModel):
    data: Optional[dict] = None
    message: Optional[str] = None
    error: Optional[str] = None
    error_message: Optional[str] = None
    code: Optional[int] = None

    model_config = ConfigDict(extra="forbid")