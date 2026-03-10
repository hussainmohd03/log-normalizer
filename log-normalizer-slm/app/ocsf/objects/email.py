from pydantic import BaseModel, Field
from typing import Optional

from objects.file import File

class Email(BaseModel):
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[list[str]] = None
    subject: Optional[str] = None
    uid: Optional[str] = None
    files: Optional[list[File]] = None