from pydantic import BaseModel
from typing import Optional
from ocsf.enums import NetworkDirectionId
class NetworkConnectionInfo(BaseModel):
    protocol_name: Optional[str] = None
    protocol_num: Optional[int] = None
    direction: Optional[str] = None
    direction_id: Optional[NetworkDirectionId] = None