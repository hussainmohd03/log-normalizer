from pydantic import BaseModel
from typing import Optional

from objects.organization import Organization
from objects.account import Account

class User(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None
    email_addr: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[int] = None
    account: Optional[Account] = None
    org: Optional[Organization] = None