from pydantic import BaseModel
from typing import Optional

from objects.process import Process
from objects.actor import Actor
from objects.network_endpoint import NetworkEndpoint
from objects.net_con_info import NetworkConnectionInfo
from objects.api import API
from objects.email import Email

class Evidence(BaseModel):
    process: Optional[Process] = None
    actor: Optional[Actor] = None
    src_endpoint: Optional[NetworkEndpoint] = None
    dst_endpoint: Optional[NetworkEndpoint] = None
    connection_info: Optional[NetworkConnectionInfo] = None
    api: Optional[API] = None
    email: Optional[Email] = None
    data: Optional[dict] = None

    model_config = {"populate_by_name": True}