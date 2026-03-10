from pydantic import BaseModel
from typing import Optional

from objects.filehash import FileHash

class File(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    hashes: Optional[list[FileHash]] = None
    type: Optional[str] = None
    type_id: Optional[int] = None
    size: Optional[int] = None