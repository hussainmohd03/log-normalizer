from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.user import User
from app.ocsf.objects.file import File

class Process(BaseModel):
    name: Optional[str] = None
    pid: Optional[int] = None
    uid: Optional[str] = None
    cmd_line: Optional[str] = None
    created_time: Optional[str] = None
    file: Optional[File] = None
    user: Optional[User] = None
    parent_process: Optional["Process"] = None  # recursive

    model_config = ConfigDict(extra="ignore")