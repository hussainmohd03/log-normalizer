from pydantic import BaseModel, ConfigDict
from app.ocsf.enums import ObservableTypeId
class Observable(BaseModel):
    name: str
    type: str
    type_id: ObservableTypeId
    value: str

    model_config = ConfigDict(extra="ignore")