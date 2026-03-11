from pydantic import BaseModel, ConfigDict
from typing import Optional

from objects.service import Service
from objects.request import Request
from objects.response import Response
class API(BaseModel):
    operation: Optional[str] = None
    service: Optional[Service] = None
    request: Optional[Request] = None
    response: Optional[Response] = None

    model_config = ConfigDict(extra="forbid")