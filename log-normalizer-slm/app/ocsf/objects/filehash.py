from pydantic import BaseModel, ConfigDict
from ocsf.enums import HashAlgorithmId
class FileHash(BaseModel):
    algorithm: str        # "MD5", "SHA-1", "SHA-256"
    algorithm_id: HashAlgorithmId     # 1=MD5, 2=SHA-1, 3=SHA-256
    value: str

    model_config = ConfigDict(extra="forbid")