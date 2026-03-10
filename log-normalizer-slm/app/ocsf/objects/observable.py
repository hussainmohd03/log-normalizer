from pydantic import BaseModel

class Observable(BaseModel):
    name: str
    type: str
    type_id: int
    value: str