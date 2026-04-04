from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.service import Service
from app.ocsf.objects.request import Request
from app.ocsf.objects.response import Response
class API(BaseModel):
    operation: Optional[str] = None
    service: Optional[Service] = None
    request: Optional[Request] = None
    response: Optional[Response] = None

    model_config = ConfigDict(extra="ignore")