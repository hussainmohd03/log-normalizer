from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.os import OS
from app.ocsf.objects.location import Location 
from app.ocsf.objects.organization import Organization
from app.ocsf.objects.user import User 
from app.ocsf.objects.agent import Agent
from app.ocsf.enums import DeviceTypeId

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

    model_config = ConfigDict(extra="forbid")