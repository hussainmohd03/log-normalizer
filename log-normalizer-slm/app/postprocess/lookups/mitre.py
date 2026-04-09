"""Minimal MITRE ATT&CK lookup for techniques and tactics we have actually
seen in training data or model outputs. Unknown ids are left alone by the
post-processor (logged as warnings, not stripped).
"""


MITRE_TECHNIQUES: dict[str, str] = {
    "T1016": "System Network Configuration Discovery",
    "T1021.004": "Remote Services: SSH",
    "T1048": "Exfiltration Over Alternative Protocol",
    "T1095": "Non-Application Layer Protocol",
    "T1112": "Modify Registry",
    "T1133": "External Remote Services",
    "T1190": "Exploit Public-Facing Application",
    "T1199": "Trusted Relationship",
    "T1485": "Data Destruction",
    "T1486": "Data Encrypted for Impact",
    "T1547.001": "Registry Run Keys / Startup Folder",
    "T1562.001": "Impair Defenses: Disable or Modify Tools",
    "T1566": "Phishing",
    "T1566.002": "Spearphishing Link",
    "T1586.003": "Compromise Accounts: Cloud Accounts",
}


MITRE_TACTICS: dict[str, str] = {
    "TA0001": "Initial Access",
    "TA0002": "Execution",
    "TA0003": "Persistence",
    "TA0005": "Defense Evasion",
    "TA0006": "Credential Access",
    "TA0007": "Discovery",
    "TA0008": "Lateral Movement",
    "TA0010": "Exfiltration",
    "TA0011": "Command and Control",
    "TA0040": "Impact",
    "TA0042": "Resource Development",
    # MITRE renamed PreAttack to Reconnaissance in 2020. The model still
    # produces the old name; Rule 14 normalizes both via this entry.
    "TA0043": "Reconnaissance",
}
