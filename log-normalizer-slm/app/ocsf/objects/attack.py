from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.ocsf.objects.technique import Technique
from app.ocsf.objects.tactic import Tactic


class Attack(BaseModel):
    tactic: Optional[Tactic] = None
    technique: Optional[Technique] = None
    sub_technique: Optional[Technique] = None

    model_config = ConfigDict(extra="forbid")