from pydantic import BaseModel
from typing import Optional

from objects.process import Process

class Evidence(BaseModel):
    process: Optional[Process] = None
    actor: Optional[Actor] = None
    network_endpoint: Optional[NetworkEndpoint] = None
    network_connection_info: Optional[NetworkConnectionInfo] = None
    api: Optional[API] = None
    email: Optional[Email] = None
    data: Optional[dict] = None