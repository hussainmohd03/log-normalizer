from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.user import User
from app.ocsf.objects.process import Process

class Actor(BaseModel):
    user: Optional[User] = None
    process: Optional[Process] = None

    model_config = ConfigDict(extra="ignore")