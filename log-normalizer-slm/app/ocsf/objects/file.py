from pydantic import BaseModel, ConfigDict
from typing import Optional

from objects.filehash import FileHash
from ocsf.enums import FileTypeId

class File(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    hashes: Optional[list[FileHash]] = None
    type: Optional[str] = None
    type_id: Optional[FileTypeId] = None
    size: Optional[int] = None

    model_config = ConfigDict(extra="forbid")