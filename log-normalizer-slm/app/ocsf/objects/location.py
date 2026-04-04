from pydantic import BaseModel, ConfigDict
from typing import Optional

class Location(BaseModel):
    city: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    long: Optional[float] = None

    model_config = ConfigDict(extra="ignore")