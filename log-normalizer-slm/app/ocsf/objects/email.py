from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

from app.ocsf.objects.file import File


class Email(BaseModel):
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[list[str]] = None
    subject: Optional[str] = None
    uid: Optional[str] = None
    files: Optional[list[File]] = None

    # OCSF v1.7.0 additions for Sentinel email enrichment.
    # message_uid is the RFC 5322 Message-ID (Sentinel internetMessageId).
    # x_originating_ip is the IP list per RFC 2822 X-Originating-IP (Sentinel senderIP).
    message_uid: Optional[str] = None
    x_originating_ip: Optional[list[str]] = None

    model_config = ConfigDict(extra="ignore", populate_by_name=True)
