from pydantic import BaseModel
from typing import Optional

from objects.user import User

class ResourceDetails(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip: Optional[str] = None
    owner: Optional[User] = None
    uid: Optional[str] = None
    type: Optional[str] = None
    data: Optional[dict] = None