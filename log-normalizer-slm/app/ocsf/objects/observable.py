from pydantic import BaseModel
from ocsf.enums import ObservableTypeId
class Observable(BaseModel):
    name: str
    type: str
    type_id: ObservableTypeId
    value: str