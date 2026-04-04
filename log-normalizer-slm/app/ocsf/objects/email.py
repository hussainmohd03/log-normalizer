from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

from app.ocsf.objects.file import File

class Email(BaseModel):
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[list[str]] = None
    subject: Optional[str] = None
    uid: Optional[str] = None
    files: Optional[list[File]] = None

    model_config = ConfigDict(extra="ignore")