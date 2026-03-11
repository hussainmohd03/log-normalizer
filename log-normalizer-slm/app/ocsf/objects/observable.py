from pydantic import BaseModel, ConfigDict
from ocsf.enums import ObservableTypeId
class Observable(BaseModel):
    name: str
    type: str
    type_id: ObservableTypeId
    value: str

    model_config = ConfigDict(extra="forbid")