from pydantic import BaseModel
from typing import Optional

from objects.technique import Technique
from objects.tactic import Tactic


class Attack(BaseModel):
    tactic: Optional[Tactic] = None
    technique: Optional[Technique] = None
    sub_technique: Optional[Technique] = None
