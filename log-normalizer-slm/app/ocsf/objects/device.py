from pydantic import BaseModel
from typing import Optional

from objects.os import OS
from objects.location import Location 
from objects.organization import Organization
from objects.user import User 
from objects.agent import Agent
from ocsf.enums import DeviceTypeId

class Device(BaseModel):
    hostname: Optional[str] = None
    name: Optional[str] = None
    ip: Optional[str] = None
    mac: Optional[str] = None
    uid: Optional[str] = None
    domain: Optional[str] = None
    type: Optional[str] = None
    type_id: Optional[DeviceTypeId] = None
    os: Optional[OS] = None
    location: Optional[Location] = None
    org: Optional[Organization] = None
    owner: Optional[User] = None
    agent: Optional[list[Agent]] = None