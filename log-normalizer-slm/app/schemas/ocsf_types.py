"""
OCSF schema constants.

Pure reference data from the OCSF specification. No business logic.
Both confidence_scorer.py and the validation layer import from here.

Update this file when targeting a new OCSF version.
Verify values against: https://schema.ocsf.io/

"""

# -- Valid OCSF Event Class UIDs ------------------------------------------

VALID_CLASS_UIDS: dict[int, str] = {
    # System Activity (category_uid 1)
    1001: "File System Activity",
    1002: "Kernel Extension Activity",
    1003: "Kernel Activity",
    1004: "Memory Activity",
    1005: "Module Activity",
    1006: "Scheduled Job Activity",
    1007: "Process Activity",
    1008: "Event Log Activity",
    1009: "Script Activity",
    1010: "Peripheral Activity",

    # Findings (category_uid 2)
    2002: "Vulnerability Finding",
    2003: "Compliance Finding",
    2004: "Detection Finding",
    2005: "Incident Finding",
    2006: "Data Security Finding",
    2007: "Application Security Posture Finding",
    2008: "IAM Analysis Finding",


    # Identity & Access Management (category_uid 3)
    3001: "Account Change",
    3002: "Authentication",
    3003: "Authorize Session",
    3004: "Entity Management",
    3005: "User Access Management",
    3006: "Group Management",

    
    # Network Activity (category_uid 4)
    4001: "Network Activity",
    4002: "HTTP Activity",
    4003: "DNS Activity",
    4004: "DHCP Activity",
    4005: "RDP Activity",
    4006: "SMB Activity",
    4007: "SSH Activity",
    4008: "FTP Activity",
    4009: "Email Activity",
    4013: "NTP Activity",
    4014: "Tunnel Activity",

    # Discovery (category_uid 5)
    5001: "Device Inventory Info",
    5003: "User Inventory Info",
    5004: "Operating System Patch State",
    5019: "Device Config State Change",
    5020: "Software Inventory Info",
    5021: "OSINT Inventory Info",
    5023: "Cloud Resources Inventory Info",
    5040: "Live Evidence Info",

    # Application Activity (category_uid 6)
    6001: "Web Resources Activity",
    6002: "Application Lifecycle",
    6003: "API Activity",
    6005: "Datastore Activity",
    6006: "File Hosting Activity",
    6007: "Scan Activity",
    6008: "Application Error",

    # Remediation (category_uid 7)
    7001: "Remediation Activity",
    7002: "File Remediation Activity",
    7003: "Process Remediation Activity",
    7004: "Network Remediation Activity",

}

VALID_CLASS_UID_SET: frozenset[int] = frozenset(VALID_CLASS_UIDS.keys())


# -- Severity IDs ------------------------------------------

SEVERITY_IDS: dict[int, str] = {
    0: "Unknown",
    1: "Informational",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Critical",
    6: "Fatal",
    99: "Other"
}

VALID_SEVERITY_IDS: frozenset[int] = frozenset(SEVERITY_IDS.keys())  


# -- Class-Specific Required Fields -----------------------------------------
# Maps class_uid → list of field names that MUST be present for that class
# to be considered a valid OCSF event. Used by the confidence scorer to
# evaluate output quality.


CLASS_REQUIRED_FIELDS: dict[int, list[str]] = {
    4001: ["src_endpoint", "dst_endpoint"],        # Network Activity
    4002: ["http_request"],                        # HTTP Activity
    4003: ["query"],                               # DNS Activity
    4004: ["src_endpoint"],                        # DHCP Activity
    4006: ["src_endpoint", "dst_endpoint"],        # SSH Activity
    3002: ["user"],                                # Authentication
    3003: ["user"],                                # Authorize Session
    1007: ["process"],                             # Process Activity
    1001: ["file"],                                # File System Activity
    2001: ["finding_info"],                        # Security Finding
    2004: ["finding_info"],                        # Detection Finding
}


# -- type_uid Formula ------------------------------------------
# type_uid = class_uid * 100 + activity_id
#
# Example: Network Activity (4001) + Traffic (5) = 400105
#
# The validation logic lives in confidence_scorer.py. 

TYPE_UID_MULTIPLIER = 100  # type_uid = class_uid * TYPE_UID_MULTIPLIER + activity_id


# -- Base Required Fields ------------------------------------------
# Every OCSF event, regardless of class, must have these fields.
BASE_REQUIRED_FIELDS: list[str] = ["class_uid", "class_name", "metadata"]

sample_log = [{
  "_id": {
    "$oid": "699ad6e7d268228cb428e8c2"
  },
  "source": "microsoft",
  "alert": {
    "id": "fa410e4342-4bfc-80a3-9600-08dd53ec811c",
    "providerAlertId": "410e4342-4bfc-80a3-9600-08dd53ec811c",
    "incidentId": "141421",
    "status": "inProgress",
    "severity": "informational",
    "classification": "",
    "determination": "",
    "serviceSource": "microsoftDefenderForOffice365",
    "detectionSource": "microsoftDefenderForOffice365",
    "productName": "Microsoft Defender for Office 365",
    "detectorId": "c8522cbb-9368-4e25-4ee9-08d8d899dfab",
    "tenantId": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "title": "Email messages from a campaign removed after delivery​",
    "description": "Emails messages from a campaign were delivered and later removed -V1.0.0.2",
    "recommendedActions": "",
    "category": "InitialAccess",
    "assignedTo": "",
    "alertWebUrl": "https://security.microsoft.com/alerts/fa410e4342-4bfc-80a3-9600-08dd53ec811c?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "incidentWebUrl": "https://security.microsoft.com/incidents/141421?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "actorDisplayName": "",
    "threatDisplayName": "",
    "threatFamilyName": "",
    "mitreTechniques": [
      "T1566"
    ],
    "createdDateTime": "2025-02-23T09:32:30.2533333Z",
    "lastUpdateDateTime": "2025-02-23T09:34:43.0633333Z",
    "resolvedDateTime": "",
    "firstActivityDateTime": "2025-02-23T09:28:24Z",
    "lastActivityDateTime": "2025-02-23T09:30:24Z",
    "systemTags": [],
    "alertPolicyId": "",
    "comments": [],
    "evidence": [
      {
        "@odata.type": "#microsoft.graph.security.mailboxEvidence",
        "createdDateTime": "2025-02-23T09:32:30.3533333Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "primaryAddress": "jeevan.sasi@btc.com.bh",
        "displayName": "Jeevan Sasi",
        "userAccount": {
          "accountName": "102958",
          "domainName": "corp.btc.com.bh",
          "userSid": "S-1-5-21-542683309-1449951431-3854495092-39028",
          "azureAdUserId": "c95669be-0e9e-496b-a759-45206bc13a2b",
          "userPrincipalName": "jeevan.sasi@btc.com.bh",
          "displayName": ""
        }
      },
      {
        "@odata.type": "#microsoft.graph.security.analyzedMessageEvidence",
        "createdDateTime": "2025-02-23T09:32:30.3533333Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "networkMessageId": "42220a17-4fae-42b7-e485-08dd51827298",
        "internetMessageId": "<010201952250f68c-07d23ea0-6632-4dea-8227-32ac0eb2188f-000000@eu-west-1.amazonses.com>",
        "subject": "مبادرة شهر رمضان المبارك",
        "language": "",
        "senderIp": "54.240.54.192",
        "recipientEmailAddress": "jeevan.sasi@btc.com.bh",
        "antiSpamDirection": "",
        "deliveryAction": "",
        "deliveryLocation": "",
        "urn": "",
        "threats": [],
        "threatDetectionMethods": [],
        "urls": [],
        "urlCount": 0,
        "attachmentsCount": 0,
        "receivedDateTime": "2025-02-20T07:44:49Z",
        "p1Sender": {
          "emailAddress": "",
          "displayName": "",
          "domainName": ""
        },
        "p2Sender": {
          "emailAddress": "consumer_friend@moic.gov.bh",
          "displayName": "",
          "domainName": ""
        }
      },
      {
        "@odata.type": "#microsoft.graph.security.userEvidence",
        "createdDateTime": "2025-02-23T09:32:30.3533333Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "stream": "",
        "userAccount": {
          "accountName": "102958",
          "domainName": "corp.btc.com.bh",
          "userSid": "S-1-5-21-542683309-1449951431-3854495092-39028",
          "azureAdUserId": "c95669be-0e9e-496b-a759-45206bc13a2b",
          "userPrincipalName": "102958@btc.com.bh",
          "displayName": "Jeevan Sasi"
        }
      }
    ],
    "additionalData": {
      "InvestigationState": 32,
      "ExtendedLinksJson": "[{\"Href\":\"https://security.microsoft.com/alerts/fa410e4342-4bfc-80a3-9600-08dd53ec811c\",\"Category\":"",\"Label\":\"alert\",\"Type\":\"webLink\"}]"
    }
  }
}]

example = [{"ocsf":{
  "class_uid": 2004,
  "class_name": "Detection Finding",
  "category_uid": 2,
  "category_name": "Findings",
  "activity_id": 1,
  "activity_name": "Create",
  "type_uid": 200401,

  "severity_id": 2,
  "severity": "Low",

  "status_id": 2,
  "status": "In Progress",

  "time": 1740302735580,
  "start_time": 1740302640000,
  "end_time": 1740302700000,

  "message": "Email reported by user as malware or phish",

  "metadata": {
    "uid": "fa690a56a5-f042-d101-916e-08dd53ebccf1",
    "version": "1.1.0",
    "product": {
      "name": "Microsoft Defender for Office 365",
      "vendor_name": "Microsoft",
      "uid": "microsoftDefenderForOffice365",
      "feature": {
        "name": "Microsoft Defender for Office 365"
      }
    },
    "tenant_uid": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "original_time": "2025-02-23T09:25:35.58Z"
  },

  "finding_info": {
    "uid": "fa690a56a5-f042-d101-916e-08dd53ebccf1",
    "title": "Email reported by user as malware or phish",
    "desc": "This alert is triggered when any email message is reported as malware or phish by users -V1.0.0.3",
    "src_url": "https://security.microsoft.com/alerts/fa690a56a5-f042-d101-916e-08dd53ebccf1?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "related_event_uids": ["141414"],
    "types": ["Malware", "Phishing"],
    "created_time": 1740302735580,
    "modified_time": 1740302913766,
    "detector_uid": "b26a5770-0c38-434a-9380-3a3c2c27bbb3"
  },

  "attacks": [
    {
      "technique": {
        "uid": "T1566",
        "name": "Phishing"
      },
      "tactic": {
        "uid": "TA0001",
        "name": "Initial Access"
      }
    }
  ],

  "email": {
    "uid": "4ffce93b-d36c-40fb-a3ba-08dd53eb10e0",
    "message_uid": "d0fa0b22c2524752a84a0a56063d73cd@P1EXGCAS01.corp.btc.com.bh",
    "subject": "Level 3 Escalation Notification for Service Request : SR-25012148323 % Time Left:24.870833",
    "from": {
      "email_addr": "CRM-Notification@btc.com.bh"
    },
    "to": [
      {
        "email_addr": "SayedHadi.Alalawi@btc.com.bh",
        "name": "Sayed Hadi Majeed"
      }
    ],
    "smtp_from": "CRM-Notification@btc.com.bh",
    "src_ip": "255.255.255.255",
    "received_time": 1740302322205
  },

  "user": {
    "name": "Sayed Hadi Majeed",
    "email_addr": "SayedHadi.Alalawi@btc.com.bh",
    "uid": "fb2d9e4e-b504-4893-a92f-2fd437b02ef9",
    "account": {
      "name": "103386",
      "type": "Windows",
      "uid": "S-1-5-21-542683309-1449951431-3854495092-46935"
    },
    "domain": "corp.btc.com.bh",
    "upn": "SayedHadi.Alalawi@btc.com.bh"
  },

  "evidences": [
    {
      "src_url": "https://security.microsoft.com/incidents/141414?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
      "data": {
        "type": "mailboxEvidence",
        "verdict": "unknown",
        "remediation_status": "none",
        "primary_address": "SayedHadi.Alalawi@btc.com.bh"
      }
    },
    {
      "src_url": "https://security.microsoft.com/incidents/141414?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
      "data": {
        "type": "analyzedMessageEvidence",
        "verdict": "unknown",
        "remediation_status": "none",
        "network_message_id": "4ffce93b-d36c-40fb-a3ba-08dd53eb10e0"
      }
    },
    {
      "data": {
        "type": "userEvidence",
        "verdict": "unknown",
        "remediation_status": "none",
        "upn": "103386@btc.com.bh"
      }
    }
  ],

  "unmapped": {
    "incidentId": "141414",
    "alertWebUrl": "https://security.microsoft.com/alerts/fa690a56a5-f042-d101-916e-08dd53ebccf1?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "category": "InitialAccess",
    "InvestigationState": 32
  }
}, "raw_log": {
  "_id": {
    "$oid": "699ad6e7d268228cb428e8c1"
  },
  "source": "microsoft",
  "alert": {
    "id": "fa690a56a5-f042-d101-916e-08dd53ebccf1",
    "providerAlertId": "690a56a5-f042-d101-916e-08dd53ebccf1",
    "incidentId": "141414",
    "status": "inProgress",
    "severity": "low",
    "classification": "",
    "determination": "",
    "serviceSource": "microsoftDefenderForOffice365",
    "detectionSource": "microsoftDefenderForOffice365",
    "productName": "Microsoft Defender for Office 365",
    "detectorId": "b26a5770-0c38-434a-9380-3a3c2c27bbb3",
    "tenantId": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "title": "Email reported by user as malware or phish",
    "description": "This alert is triggered when any email message is reported as malware or phish by users -V1.0.0.3",
    "recommendedActions": "",
    "category": "InitialAccess",
    "assignedTo": "",
    "alertWebUrl": "https://security.microsoft.com/alerts/fa690a56a5-f042-d101-916e-08dd53ebccf1?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "incidentWebUrl": "https://security.microsoft.com/incidents/141414?tid=2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "actorDisplayName": "",
    "threatDisplayName": "",
    "threatFamilyName": "",
    "mitreTechniques": [
      "T1566"
    ],
    "createdDateTime": "2025-02-23T09:25:35.58Z",
    "lastUpdateDateTime": "2025-02-23T09:28:33.7666667Z",
    "resolvedDateTime": "",
    "firstActivityDateTime": "2025-02-23T09:24:00Z",
    "lastActivityDateTime": "2025-02-23T09:25:00Z",
    "systemTags": [],
    "alertPolicyId": "",
    "comments": [],
    "evidence": [
      {
        "@odata.type": "#microsoft.graph.security.mailboxEvidence",
        "createdDateTime": "2025-02-23T09:25:35.7666667Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "primaryAddress": "SayedHadi.Alalawi@btc.com.bh",
        "displayName": "Sayed Hadi Majeed",
        "userAccount": {
          "accountName": "103386",
          "domainName": "corp.btc.com.bh",
          "userSid": "S-1-5-21-542683309-1449951431-3854495092-46935",
          "azureAdUserId": "fb2d9e4e-b504-4893-a92f-2fd437b02ef9",
          "userPrincipalName": "SayedHadi.Alalawi@btc.com.bh",
          "displayName": ""
        }
      },
      {
        "@odata.type": "#microsoft.graph.security.analyzedMessageEvidence",
        "createdDateTime": "2025-02-23T09:25:35.7666667Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "networkMessageId": "4ffce93b-d36c-40fb-a3ba-08dd53eb10e0",
        "internetMessageId": "d0fa0b22c2524752a84a0a56063d73cd@P1EXGCAS01.corp.btc.com.bh",
        "subject": "Level 3 Escalation Notification for Service Request : SR-25012148323 % Time Left:24.870833",
        "language": "",
        "senderIp": "255.255.255.255",
        "recipientEmailAddress": "SayedHadi.Alalawi@btc.com.bh",
        "antiSpamDirection": "",
        "deliveryAction": "",
        "deliveryLocation": "",
        "urn": "",
        "threats": [],
        "threatDetectionMethods": [],
        "urls": [],
        "urlCount": 0,
        "attachmentsCount": 0,
        "receivedDateTime": "2025-02-23T09:18:42.2055866Z",
        "p1Sender": {
          "emailAddress": "",
          "displayName": "",
          "domainName": ""
        },
        "p2Sender": {
          "emailAddress": "CRM-Notification@btc.com.bh",
          "displayName": "",
          "domainName": ""
        }
      },
      {
        "@odata.type": "#microsoft.graph.security.userEvidence",
        "createdDateTime": "2025-02-23T09:25:35.7666667Z",
        "verdict": "unknown",
        "remediationStatus": "none",
        "remediationStatusDetails": "",
        "roles": [],
        "detailedRoles": [],
        "tags": [],
        "stream": "",
        "userAccount": {
          "accountName": "103386",
          "domainName": "corp.btc.com.bh",
          "userSid": "S-1-5-21-542683309-1449951431-3854495092-46935",
          "azureAdUserId": "fb2d9e4e-b504-4893-a92f-2fd437b02ef9",
          "userPrincipalName": "103386@btc.com.bh",
          "displayName": "Sayed Hadi Majeed"
        }
      }
    ],
    "additionalData": {
      "InvestigationState": 32,
      "ExtendedLinksJson": "[{\"Href\":\"https://security.microsoft.com/viewalerts?id=690a56a5-f042-d101-916e-08dd53ebccf1\",\"Category\":"",\"Label\":\"alert\",\"Type\":\"webLink\"}]"
    }
  }
}, "source": "microsoft" , "format": "json"} ]
