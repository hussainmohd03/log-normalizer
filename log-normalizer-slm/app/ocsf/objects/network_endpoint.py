from pydantic import BaseModel, ConfigDict
from typing import Optional

class NetworkEndpoint(BaseModel):
    ip: Optional[str] = None
    port: Optional[int] = None
    hostname: Optional[str] = None
    domain: Optional[str] = None
    mac: Optional[str] = None
    uid: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(extra="ignore")