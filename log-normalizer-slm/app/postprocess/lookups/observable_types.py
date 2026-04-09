from typing import Optional

from app.ocsf.enums import ObservableTypeId


_CANONICAL_NAMES: dict[str, str] = {
    "UNKNOWN": "Unknown",
    "HOSTNAME": "Hostname",
    "IP_ADDRESS": "IP Address",
    "MAC_ADDRESS": "MAC Address",
    "USER_NAME": "User Name",
    "EMAIL_ADDRESS": "Email Address",
    "URL_STRING": "URL String",
    "FILE_NAME": "File Name",
    "HASH": "Hash",
    "PROCESS_NAME": "Process Name",
    "RESOURCE_UID": "Resource UID",
    "PORT": "Port",
    "SUBNET": "Subnet",
    "COMMAND_LINE": "Command Line",
    "COUNTRY": "Country",
    "PROCESS_ID": "Process ID",
    "HTTP_USER_AGENT": "HTTP User-Agent",
    "CWE_UID": "CWE UID",
    "CVE_UID": "CVE UID",
    "USER_CREDENTIAL_ID": "User Credential ID",
    "ENDPOINT": "Endpoint",
    "USER": "User",
    "EMAIL": "Email",
    "URL": "URL",
    "FILE": "File",
    "PROCESS": "Process",
    "GEO_LOCATION": "Geo Location",
    "CONTAINER": "Container",
    "REGISTRY_KEY": "Registry Key",
    "REGISTRY_VALUE": "Registry Value",
    "FINGERPRINT": "Fingerprint",
    "USER_UID": "User UID",
    "GROUP_NAME": "Group Name",
    "GROUP_UID": "Group UID",
    "ACCOUNT_NAME": "Account Name",
    "ACCOUNT_UID": "Account UID",
    "SCRIPT_CONTENT": "Script Content",
    "SERIAL_NUMBER": "Serial Number",
    "RESOURCE_DETAILS_NAME": "Resource Details Name",
    "PROCESS_ENTITY_UID": "Process Entity UID",
    "EMAIL_SUBJECT": "Email Subject",
    "EMAIL_UID": "Email UID",
    "MESSAGE_UID": "Message UID",
    "REGISTRY_VALUE_NAME": "Registry Value Name",
    "ADVISORY_UID": "Advisory UID",
    "FILE_PATH": "File Path",
    "REGISTRY_KEY_PATH": "Registry Key Path",
    "DEVICE_UID": "Device UID",
    "NETWORK_ENDPOINT_UID": "Network Endpoint UID",
    "OTHER": "Other",
}


def _build_lookup() -> dict[str, tuple[int, str]]:
    table: dict[str, tuple[int, str]] = {}
    for member in ObservableTypeId:
        canonical = _CANONICAL_NAMES[member.name]
        entry = (member.value, canonical)
        table[canonical.lower()] = entry
        table[member.name.lower()] = entry
    return table


_LOOKUP = _build_lookup()


def lookup_observable_type(name: str) -> Optional[tuple[int, str]]:
    if not name:
        return None
    return _LOOKUP.get(name.strip().lower())
