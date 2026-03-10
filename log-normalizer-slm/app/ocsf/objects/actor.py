from pydantic import BaseModel
from typing import Optional

from objects.user import User
from objects.process import Process

class Actor(BaseModel):
    user: Optional[User] = None
    process: Optional[Process] = None