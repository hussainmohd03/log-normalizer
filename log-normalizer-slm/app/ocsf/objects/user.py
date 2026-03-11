from pydantic import BaseModel, ConfigDict
from typing import Optional

from objects.organization import Organization
from objects.account import Account
from ocsf.enums import UserTypeId
class User(BaseModel):
    name: Optional[str] = None
    uid: Optional[str] = None
    email_addr: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[UserTypeId] = None
    account: Optional[Account] = None
    org: Optional[Organization] = None

    model_config = ConfigDict(extra="forbid")