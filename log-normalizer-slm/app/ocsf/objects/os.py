from pydantic import BaseModel, ConfigDict
from typing import Optional
from app.ocsf.enums import OSTypeId
class OS(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[OSTypeId] = None
    version: Optional[str] = None

    model_config = ConfigDict(extra="ignore")
