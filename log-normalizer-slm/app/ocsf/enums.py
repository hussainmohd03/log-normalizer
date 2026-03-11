from enum import IntEnum

class SeverityId(IntEnum):
    UNKNOWN = 0
    INFORMATIONAL = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    CRITICAL = 5
    FATAL = 6
    OTHER = 99


class MalwareClassificationId(IntEnum):
    UNKNOWN = 0
    ADWARE = 1
    BACKDOOR = 2
    BOT = 3
    BOOTKIT = 4
    DDOS = 5
    DOWNLOADER = 6
    DROPPER = 7
    EXPLOIT_KIT = 8
    KEYLOGGER = 9
    RANSOMWARE = 10
    REMOTE_ACCESS_TROJAN = 11
    # 12 intentionally missing in OCSF spec
    RESOURCE_EXPLOITATION = 13
    ROGUE_SECURITY_SOFTWARE = 14
    ROOTKIT = 15
    SCREEN_CAPTURE = 16
    SPYWARE = 17
    TROJAN = 18
    VIRUS = 19
    WEBSHELL = 20
    WIPER = 21
    WORM = 22
    OTHER = 99


class ObservableTypeId(IntEnum):
    UNKNOWN = 0
    HOSTNAME = 1
    IP_ADDRESS = 2
    MAC_ADDRESS = 3
    USER_NAME = 4
    EMAIL_ADDRESS = 5
    URL_STRING = 6
    FILE_NAME = 7
    HASH = 8
    PROCESS_NAME = 9
    RESOURCE_UID = 10
    PORT = 11
    SUBNET = 12
    COMMAND_LINE = 13
    COUNTRY = 14
    PROCESS_ID = 15
    HTTP_USER_AGENT = 16
    CWE_UID = 17
    CVE_UID = 18
    USER_CREDENTIAL_ID = 19
    ENDPOINT = 20
    USER = 21
    EMAIL = 22
    URL = 23
    FILE = 24
    PROCESS = 25
    GEO_LOCATION = 26
    CONTAINER = 27
    REGISTRY_KEY = 28
    REGISTRY_VALUE = 29
    FINGERPRINT = 30
    USER_UID = 31
    GROUP_NAME = 32
    GROUP_UID = 33
    ACCOUNT_NAME = 34
    ACCOUNT_UID = 35
    SCRIPT_CONTENT = 36
    SERIAL_NUMBER = 37
    RESOURCE_DETAILS_NAME = 38
    PROCESS_ENTITY_UID = 39
    EMAIL_SUBJECT = 40
    EMAIL_UID = 41
    MESSAGE_UID = 42
    REGISTRY_VALUE_NAME = 43
    ADVISORY_UID = 44
    FILE_PATH = 45
    REGISTRY_KEY_PATH = 46
    DEVICE_UID = 47
    NETWORK_ENDPOINT_UID = 48
    OTHER = 99

class DeviceTypeId(IntEnum):
    UNKNOWN = 0
    SERVER = 1
    DESKTOP = 2
    LAPTOP = 3
    TABLET = 4
    MOBILE = 5
    VIRTUAL = 6
    IOT = 7
    BROWSER = 8
    FIREWALL = 9
    SWITCH = 10
    HUB = 11
    ROUTER = 12
    IDS = 13
    IPS = 14
    LOAD_BALANCER = 15
    OTHER = 99


class FileTypeId(IntEnum):
    UNKNOWN = 0
    REGULAR_FILE = 1
    FOLDER = 2
    CHARACTER_DEVICE = 3
    BLOCK_DEVICE = 4
    LOCAL_SOCKET = 5
    NAMED_PIPE = 6
    SYMBOLIC_LINK = 7
    EXECUTABLE_FILE = 8
    OTHER = 99

class HashAlgorithmId(IntEnum):
    UNKNOWN = 0
    MD5 = 1
    SHA_1 = 2
    SHA_256 = 3
    SHA_512 = 4
    CTPH = 5
    TLSH = 6
    QUICK_XOR_HASH = 7
    SHA_224 = 8
    SHA_384 = 9
    SHA_512_224 = 10
    SHA_512_256 = 11
    SHA3_224 = 12
    SHA3_256 = 13
    SHA3_384 = 14
    SHA3_512 = 15
    XXHASH_H3_64 = 16
    XXHASH_H3_128 = 17
    OTHER = 99

class NetworkDirectionId(IntEnum):
    UNKNOWN = 0
    INBOUND = 1
    OUTBOUND = 2
    LATERAL = 3
    LOCAL = 4
    OTHER = 99


class OSTypeId(IntEnum):
    UNKNOWN = 0
    OTHER = 99
    WINDOWS = 100
    WINDOWS_MOBILE = 101
    LINUX = 200
    ANDROID = 201
    MACOS = 300
    IOS = 301
    IPADOS = 302
    SOLARIS = 400
    AIX = 401
    HP_UX = 402

class UserTypeId(IntEnum):
    UNKNOWN = 0
    USER = 1
    ADMIN = 2
    SYSTEM = 3
    SERVICE = 4
    OTHER = 99

class StatusId(IntEnum):
    UNKNOWN = 0
    NEW = 1
    IN_PROGRESS = 2
    SUPPRESSED = 3
    RESOLVED = 4
    ARCHIVED = 5
    DELETED = 6
    OTHER = 99
class RiskLevelId(IntEnum):
    INFO = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4
    OTHER = 99