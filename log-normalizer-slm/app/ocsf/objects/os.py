from pydantic import BaseModel
from typing import Optional
from ocsf.enums import OSTypeId
class OS(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[OSTypeId] = None
    version: Optional[str] = None


    