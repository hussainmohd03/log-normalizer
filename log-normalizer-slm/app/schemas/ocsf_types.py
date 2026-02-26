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
    "$oid": "699ad6e7d268228cb428e8a2"
  },
  "source": "splunk",
  "alert": {
    "ActorContextId": [
      "1431d963-dd68-45de-a3f9-03ee2f101ec2",
      "2df07d77-3b86-4bb2-a205-6527a1f37ffc"
    ],
    "ActorIpAddress": [
      "103.172.226.86",
      "87.200.94.254"
    ],
    "Actor{}.ID": [
      "55db906b-dfc9-4dae-97b8-bb2512f0b044",
      "90502785-3573-483b-9216-cac5b035ffdd"
    ],
    "Actor{}.Type": "0",
    "ApplicationId": "5dd23862-8a76-4ed0-8fdd-6869ce330c86",
    "AzureActiveDirectoryEventType": "1",
    "BrowserType": "Edge",
    "City": [
      "Bhiwandi (New Kaneri)",
      "Dubai (Al Sufouh)"
    ],
    "ClientIP": [
      "103.172.226.86",
      "87.200.94.254"
    ],
    "Country": [
      "India",
      "United Arab Emirates"
    ],
    "CreationTime": [
      "2025-02-22T13:06:47",
      "2025-02-22T13:08:10",
      "2025-02-22T16:00:24",
      "2025-02-22T16:00:27",
      "2025-02-22T16:00:29",
      "2025-02-22T16:00:32",
      "2025-02-22T16:00:39",
      "2025-02-22T16:00:41",
      "2025-02-22T16:00:45",
      "2025-02-22T16:00:47",
      "2025-02-22T16:00:48",
      "2025-02-22T16:00:50",
      "2025-02-22T16:00:52",
      "2025-02-22T16:00:54",
      "2025-02-22T16:00:55"
    ],
    "DeviceProperties{}.Name": [
      "BrowserType",
      "OS"
    ],
    "DeviceProperties{}.Value": [
      "Edge",
      "Windows"
    ],
    "ErrorNumber": "500121",
    "ExtendedProperties{}.Name": [
      "RequestType",
      "ResultStatusDetail",
      "UserAgent"
    ],
    "ExtendedProperties{}.Value": [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)",
      "SAS:EndAuth",
      "UserError"
    ],
    "Id": [
      "2c26ebda-ed27-4b16-8f2f-30f7abbc5800",
      "6f26be62-19d8-4a53-9077-90e420176700",
      "6f26be62-19d8-4a53-9077-90e4c8166700",
      "6f26be62-19d8-4a53-9077-90e4ef166700",
      "70e52c32-01ea-4d3d-9dbd-8d7959cb6600",
      "7c9e48ee-e60b-494a-8399-b8b06d9f6100",
      "7e7986a1-e469-4fcd-83ca-1af9c3934a00",
      "7e7986a1-e469-4fcd-83ca-1af9c9934a00",
      "8457aee1-90b5-48a7-8ed3-e79acdb76200",
      "8457aee1-90b5-48a7-8ed3-e79aecb76200",
      "975a5eca-3c72-4e9b-a2e2-cc9bf7626800",
      "a9aa9678-0517-4e2e-96cb-210c078b5200",
      "b148be30-c12d-42fe-89b4-3fc5f5974e00",
      "da248317-f8e2-45c2-bc0d-00ccd28b6800",
      "da248317-f8e2-45c2-bc0d-00ccee8b6800"
    ],
    "InterSystemsId": [
      "51827fda-146a-47dc-a006-a4bbe3727ce0",
      "b311874d-de56-431f-977b-d6c7559008d5"
    ],
    "IntraSystemId": [
      "2c26ebda-ed27-4b16-8f2f-30f7abbc5800",
      "6f26be62-19d8-4a53-9077-90e420176700",
      "6f26be62-19d8-4a53-9077-90e4c8166700",
      "6f26be62-19d8-4a53-9077-90e4ef166700",
      "70e52c32-01ea-4d3d-9dbd-8d7959cb6600",
      "7c9e48ee-e60b-494a-8399-b8b06d9f6100",
      "7e7986a1-e469-4fcd-83ca-1af9c3934a00",
      "7e7986a1-e469-4fcd-83ca-1af9c9934a00",
      "8457aee1-90b5-48a7-8ed3-e79acdb76200",
      "8457aee1-90b5-48a7-8ed3-e79aecb76200",
      "975a5eca-3c72-4e9b-a2e2-cc9bf7626800",
      "a9aa9678-0517-4e2e-96cb-210c078b5200",
      "b148be30-c12d-42fe-89b4-3fc5f5974e00",
      "da248317-f8e2-45c2-bc0d-00ccd28b6800",
      "da248317-f8e2-45c2-bc0d-00ccee8b6800"
    ],
    "LogonError": "AuthenticationFailedSasError",
    "OS": "Windows",
    "ObjectId": "00000002-0000-0000-c000-000000000000",
    "Operation": "UserLoginFailed",
    "OrganizationId": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "RecordType": "15",
    "Region": [
      "Dubai",
      "Maharashtra"
    ],
    "RequestType": "SAS:EndAuth",
    "ResultStatus": "Failed",
    "ResultStatusDetail": "UserError",
    "TargetContextId": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "Target{}.ID": "00000002-0000-0000-c000-000000000000",
    "Target{}.Type": "0",
    "UserAgent": [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)"
    ],
    "UserId": "00000000-0000-0000-0000-000000000000",
    "UserKey": [
      "55db906b-dfc9-4dae-97b8-bb2512f0b044",
      "90502785-3573-483b-9216-cac5b035ffdd"
    ],
    "UserType": "6",
    "Version": "1",
    "Workload": "AzureActiveDirectory",
    "_bkt": "notable~236~FB7D9A4E-8588-4C7F-98BA-C452FC2EFF55",
    "_cd": "236:4732",
    "_eventtype_color": "none",
    "_indextime": "1740241023",
    "_raw": "1740241016, search_name=\"Cloud_O365_DET_Multiple_timed_out_pushes_to_device\", ActorContextId=\"1431d963-dd68-45de-a3f9-03ee2f101ec2\", ActorContextId=\"2df07d77-3b86-4bb2-a205-6527a1f37ffc\", ActorIpAddress=\"103.172.226.86\", ActorIpAddress=\"87.200.94.254\", Actor{}.ID=\"55db906b-dfc9-4dae-97b8-bb2512f0b044\", Actor{}.ID=\"90502785-3573-483b-9216-cac5b035ffdd\", Actor{}.Type=\"0\", ApplicationId=\"5dd23862-8a76-4ed0-8fdd-6869ce330c86\", AzureActiveDirectoryEventType=\"1\", BrowserType=\"Edge\", City=\"Bhiwandi (New Kaneri)\", City=\"Dubai (Al Sufouh)\", ClientIP=\"103.172.226.86\", ClientIP=\"87.200.94.254\", Country=\"India\", Country=\"United Arab Emirates\", CreationTime=\"2025-02-22T13:06:47\", CreationTime=\"2025-02-22T13:08:10\", CreationTime=\"2025-02-22T16:00:24\", CreationTime=\"2025-02-22T16:00:27\", CreationTime=\"2025-02-22T16:00:29\", CreationTime=\"2025-02-22T16:00:32\", CreationTime=\"2025-02-22T16:00:39\", CreationTime=\"2025-02-22T16:00:41\", CreationTime=\"2025-02-22T16:00:45\", CreationTime=\"2025-02-22T16:00:47\", CreationTime=\"2025-02-22T16:00:48\", CreationTime=\"2025-02-22T16:00:50\", CreationTime=\"2025-02-22T16:00:52\", CreationTime=\"2025-02-22T16:00:54\", CreationTime=\"2025-02-22T16:00:55\", DeviceProperties{}.Name=\"BrowserType\", DeviceProperties{}.Name=\"OS\", DeviceProperties{}.Value=\"Edge\", DeviceProperties{}.Value=\"Windows\", ErrorNumber=\"500121\", ExtendedProperties{}.Name=\"RequestType\", ExtendedProperties{}.Name=\"ResultStatusDetail\", ExtendedProperties{}.Name=\"UserAgent\", ExtendedProperties{}.Value=\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36\", ExtendedProperties{}.Value=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)\", ExtendedProperties{}.Value=\"SAS:EndAuth\", ExtendedProperties{}.Value=\"UserError\", Id=\"2c26ebda-ed27-4b16-8f2f-30f7abbc5800\", Id=\"6f26be62-19d8-4a53-9077-90e420176700\", Id=\"6f26be62-19d8-4a53-9077-90e4c8166700\", Id=\"6f26be62-19d8-4a53-9077-90e4ef166700\", Id=\"70e52c32-01ea-4d3d-9dbd-8d7959cb6600\", Id=\"7c9e48ee-e60b-494a-8399-b8b06d9f6100\", Id=\"7e7986a1-e469-4fcd-83ca-1af9c3934a00\", Id=\"7e7986a1-e469-4fcd-83ca-1af9c9934a00\", Id=\"8457aee1-90b5-48a7-8ed3-e79acdb76200\", Id=\"8457aee1-90b5-48a7-8ed3-e79aecb76200\", Id=\"975a5eca-3c72-4e9b-a2e2-cc9bf7626800\", Id=\"a9aa9678-0517-4e2e-96cb-210c078b5200\", Id=\"b148be30-c12d-42fe-89b4-3fc5f5974e00\", Id=\"da248317-f8e2-45c2-bc0d-00ccd28b6800\", Id=\"da248317-f8e2-45c2-bc0d-00ccee8b6800\", InterSystemsId=\"51827fda-146a-47dc-a006-a4bbe3727ce0\", InterSystemsId=\"b311874d-de56-431f-977b-d6c7559008d5\", IntraSystemId=\"2c26ebda-ed27-4b16-8f2f-30f7abbc5800\", IntraSystemId=\"6f26be62-19d8-4a53-9077-90e420176700\", IntraSystemId=\"6f26be62-19d8-4a53-9077-90e4c8166700\", IntraSystemId=\"6f26be62-19d8-4a53-9077-90e4ef166700\", IntraSystemId=\"70e52c32-01ea-4d3d-9dbd-8d7959cb6600\", IntraSystemId=\"7c9e48ee-e60b-494a-8399-b8b06d9f6100\", IntraSystemId=\"7e7986a1-e469-4fcd-83ca-1af9c3934a00\", IntraSystemId=\"7e7986a1-e469-4fcd-83ca-1af9c9934a00\", IntraSystemId=\"8457aee1-90b5-48a7-8ed3-e79acdb76200\", IntraSystemId=\"8457aee1-90b5-48a7-8ed3-e79aecb76200\", IntraSystemId=\"975a5eca-3c72-4e9b-a2e2-cc9bf7626800\", IntraSystemId=\"a9aa9678-0517-4e2e-96cb-210c078b5200\", IntraSystemId=\"b148be30-c12d-42fe-89b4-3fc5f5974e00\", IntraSystemId=\"da248317-f8e2-45c2-bc0d-00ccd28b6800\", IntraSystemId=\"da248317-f8e2-45c2-bc0d-00ccee8b6800\", LogonError=\"AuthenticationFailedSasError\", OS=\"Windows\", ObjectId=\"00000002-0000-0000-c000-000000000000\", Operation=\"UserLoginFailed\", OrganizationId=\"2df07d77-3b86-4bb2-a205-6527a1f37ffc\", RecordType=\"15\", Region=\"Dubai\", Region=\"Maharashtra\", RequestType=\"SAS:EndAuth\", ResultStatus=\"Failed\", ResultStatusDetail=\"UserError\", TargetContextId=\"2df07d77-3b86-4bb2-a205-6527a1f37ffc\", Target{}.ID=\"00000002-0000-0000-c000-000000000000\", Target{}.Type=\"0\", UserAgent=\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36\", UserAgent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)\", UserId=\"00000000-0000-0000-0000-000000000000\", UserKey=\"55db906b-dfc9-4dae-97b8-bb2512f0b044\", UserKey=\"90502785-3573-483b-9216-cac5b035ffdd\", UserType=\"6\", Version=\"1\", Workload=\"AzureActiveDirectory\", action=\"failure\", app=\"AzureActiveDirectory\", authentication_service=\"AzureActiveDirectory\", command=\"UserLoginFailed\", dataset_name=\"authentication\", dest=\"Microsoft Office 365 AzureActiveDirectory\", dest_is_expected=\"false\", dest_name=\"Microsoft Office 365 AzureActiveDirectory\", dest_pci_domain=\"untrust\", dest_requires_av=\"false\", dest_should_timesync=\"false\", dest_should_update=\"false\", dvc=\"AzureActiveDirectory\", dvc_is_expected=\"false\", dvc_pci_domain=\"untrust\", dvc_requires_av=\"false\", dvc_should_timesync=\"false\", dvc_should_update=\"false\", event_type=\"AzureApplicationAuditEvent\", orig_eventtype=\"err0r\", orig_eventtype=\"o365_authentication\", orig_host=\"sh-i-034701e8cad196ecc.batelco.splunkcloud.com\", orig_index=\"o365\", info_max_time=\"1740240900.000000000\", info_min_time=\"1740226500.000000000\", info_search_time=\"1740241011.695206000\", lat=\"19.28940\", lat=\"25.08980\", orig_linecount=\"1\", lon=\"55.15280\", lon=\"73.06110\", mfa_prompts=\"15\", reason=\"AuthenticationFailedSasError\", record_type=\"AzureActiveDirectoryStsLogon\", result=\"UserError\", signature=\"UserLoginFailed\", orig_source=\"https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222130713034057028$20250222131118784023059$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014\", orig_source=\"https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222132710889020619$20250222133109848059834$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014\", orig_source=\"https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222160220825008056$20250222160509359003243$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014\", orig_source=\"https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222160709045052701$20250222161112799002299$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014\", orig_source=\"https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222161211480032215$20250222161613392030198$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014\", orig_sourcetype=\"o365:management:activity\", orig_splunk_server=\"idx-i-0b2a94cb716b20c12.batelco.splunkcloud.com\", orig_splunk_server=\"idx-i-0e2b89957126c6f17.batelco.splunkcloud.com\", orig_splunk_server=\"idx-i-0e9830733b981ede3.batelco.splunkcloud.com\", src=\"103.172.226.86\", src=\"87.200.94.254\", src_ip=\"103.172.226.86\", src_ip=\"87.200.94.254\", src_is_expected=\"false\", src_pci_domain=\"untrust\", src_requires_av=\"false\", src_should_timesync=\"false\", src_should_update=\"false\", orig_status=\"failure\", orig_tag=\"authentication\", orig_tag=\"cloud\", orig_tag=\"error\", orig_tag=\"failure\", orig_tag::action=\"failure\", orig_tag::eventtype=\"authentication\", orig_tag::eventtype=\"cloud\", orig_tag::eventtype=\"error\", tenant_id=\"2df07d77-3b86-4bb2-a205-6527a1f37ffc\", throttling_input=\"9f89c84a559f573636a47ff8daed0d33\", orig_timeendpos=\"37\", orig_timestartpos=\"18\", user=\"00000000-0000-0000-0000-000000000000\", user_agent=\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36\", user_agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)\", user_id=\"00000000-0000-0000-0000-000000000000\", user_type=\"ServicePrincipal\", user_watchlist=\"false\", vendor_account=\"2df07d77-3b86-4bb2-a205-6527a1f37ffc\", vendor_product=\"Microsoft Office 365 AzureActiveDirectory\"",
    "_serial": "0",
    "_si": [
      "idx-i-0c5c7f0dc7dbc6446.batelco.splunkcloud.com",
      "notable"
    ],
    "_sourcetype": "stash",
    "_time": "2025-02-22T19:16:56.000+03:00",
    "action": "failure",
    "app": "AzureActiveDirectory",
    "authentication_service": "AzureActiveDirectory",
    "command": "UserLoginFailed",
    "dataset_name": "authentication",
    "date_hour": "16",
    "date_mday": "22",
    "date_minute": "16",
    "date_month": "february",
    "date_second": "56",
    "date_wday": "saturday",
    "date_year": "2025",
    "date_zone": "0",
    "dest": "Microsoft Office 365 AzureActiveDirectory",
    "dest_is_expected": "false",
    "dest_name": "Microsoft Office 365 AzureActiveDirectory",
    "dest_pci_domain": "untrust",
    "dest_requires_av": "false",
    "dest_should_timesync": "false",
    "dest_should_update": "false",
    "dvc": "AzureActiveDirectory",
    "dvc_is_expected": "false",
    "dvc_pci_domain": "untrust",
    "dvc_requires_av": "false",
    "dvc_should_timesync": "false",
    "dvc_should_update": "false",
    "event_id": "FB7D9A4E-8588-4C7F-98BA-C452FC2EFF55@@notable@@31854ec2b3a5a7939e2abed1e7b0bfec",
    "event_type": "AzureApplicationAuditEvent",
    "eventtype": [
      "modnotable_results",
      "notable"
    ],
    "host": "sh-i-034701e8cad196ecc.batelco.splunkcloud.com",
    "index": "notable",
    "indexer_guid": "FB7D9A4E-8588-4C7F-98BA-C452FC2EFF55",
    "info_max_time": "1740240900.000000000",
    "info_min_time": "1740226500.000000000",
    "info_search_time": "1740241011.695206000",
    "lat": [
      "19.28940",
      "25.08980"
    ],
    "linecount": "1",
    "lon": [
      "55.15280",
      "73.06110"
    ],
    "mfa_prompts": "15",
    "orig_action_name": "notable",
    "orig_eventtype": [
      "err0r",
      "o365_authentication"
    ],
    "orig_host": "sh-i-034701e8cad196ecc.batelco.splunkcloud.com",
    "orig_index": "o365",
    "orig_linecount": "1",
    "orig_rid": "0",
    "orig_sid": "scheduler__beyoncybersoar__search__RMD55dc03935f6d5df8e_at_1740240900_13614",
    "orig_source": [
      "https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222130713034057028$20250222131118784023059$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014",
      "https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222132710889020619$20250222133109848059834$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014",
      "https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222160220825008056$20250222160509359003243$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014",
      "https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222160709045052701$20250222161112799002299$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014",
      "https://manage.office.com/api/v1.0/2df07d77-3b86-4bb2-a205-6527a1f37ffc/activity/feed/audit/20250222161211480032215$20250222161613392030198$audit_azureactivedirectory$Audit_AzureActiveDirectory$emea0014"
    ],
    "orig_sourcetype": "o365:management:activity",
    "orig_splunk_server": [
      "idx-i-0b2a94cb716b20c12.batelco.splunkcloud.com",
      "idx-i-0e2b89957126c6f17.batelco.splunkcloud.com",
      "idx-i-0e9830733b981ede3.batelco.splunkcloud.com"
    ],
    "orig_status": "failure",
    "orig_tag": [
      "authentication",
      "cloud",
      "error",
      "failure"
    ],
    "orig_tag::action": "failure",
    "orig_tag::eventtype": [
      "authentication",
      "cloud",
      "error"
    ],
    "orig_timeendpos": "37",
    "orig_timestartpos": "18",
    "reason": "AuthenticationFailedSasError",
    "record_type": "AzureActiveDirectoryStsLogon",
    "result": "UserError",
    "rule_id": "FB7D9A4E-8588-4C7F-98BA-C452FC2EFF55@@notable@@31854ec2b3a5a7939e2abed1e7b0bfec",
    "search_name": "Cloud_O365_DET_Multiple_timed_out_pushes_to_device",
    "signature": "UserLoginFailed",
    "source": "Cloud_O365_DET_Multiple_timed_out_pushes_to_device",
    "sourcetype": "stash",
    "splunk_server": "idx-i-0c5c7f0dc7dbc6446.batelco.splunkcloud.com",
    "src": [
      "103.172.226.86",
      "87.200.94.254"
    ],
    "src_ip": [
      "103.172.226.86",
      "87.200.94.254"
    ],
    "src_is_expected": "false",
    "src_pci_domain": "untrust",
    "src_requires_av": "false",
    "src_should_timesync": "false",
    "src_should_update": "false",
    "tag": [
      "failure",
      "modaction_result",
      "authentication",
      "cloud",
      "error"
    ],
    "tag::action": "failure",
    "tag::eventtype": "modaction_result",
    "tenant_id": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "throttling_input": "9f89c84a559f573636a47ff8daed0d33",
    "timeendpos": "182",
    "timestartpos": "172",
    "user": "00000000-0000-0000-0000-000000000000",
    "user_agent": [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0 AnyConnect/5.0.05040 (win)"
    ],
    "user_id": "00000000-0000-0000-0000-000000000000",
    "user_type": "ServicePrincipal",
    "user_watchlist": "false",
    "vendor_account": "2df07d77-3b86-4bb2-a205-6527a1f37ffc",
    "vendor_product": "Microsoft Office 365 AzureActiveDirectory",
    "annotations.mitre_attack": "Credential Access",
    "annotations": "{\"mitre_attack\":[\"Credential Access\"]}",
    "security_domain": "cloud/o365",
    "severity": "low",
    "rule_name": "Cloud_O365_DET_Multiple_timed_out_pushes_to_device",
    "savedsearch_description": "Multiple failed logins with several MFA attempts.",
    "rule_title": "Cloud_O365_DET_Multiple_timed_out_pushes_to_device",
    "rule_description": "Multiple failed logins with several MFA attempts.",
    "drilldown_name": "Investigate Further",
    "drilldown_search": "`o365_management_activity` Operation=\"UserLoginFailed\" ErrorNumber=\"500121\" NOT UserType=\"4\"| iplocation src_ip| search Country!=\"Bahrain\"| bucket span=10m _time | stats dc(_raw) AS mfa_prompts, values(*) as * by user| where mfa_prompts > 10| eval _comment=\"Adding throttling to above query to enable better suppression control\"| eval throttling_input=user| eval throttling_input=md5(throttling_input)",
    "drilldown_searches": "{\"name\":\"Investigate Further\",\"search\":\"`o365_management_activity` Operation=\\\"UserLoginFailed\\\" ErrorNumber=\\\"500121\\\" NOT UserType=\\\"4\\\"| iplocation src_ip| search Country!=\\\"Bahrain\\\"| bucket span=10m _time | stats dc(_raw) AS mfa_prompts, values(*) as * by user| where mfa_prompts > 10| eval _comment=\\\"Adding throttling to above query to enable better suppression control\\\"| eval throttling_input=user| eval throttling_input=md5(throttling_input)\",\"earliest\":1740226500,\"latest\":1740240900,\"index_earliest\":null,\"index_latest\":null}",
    "drilldown_earliest_offset": "$info_min_time$",
    "drilldown_latest_offset": "$info_max_time$",
    "default_status": "1",
    "default_owner": "unassigned",
    "investigation_profiles": "{}",
    "extract_artifacts": "{\"asset\":[\"src\",\"dest\",\"dvc\",\"orig_host\"],\"identity\":[\"src_user\",\"user\",\"src_user_id\",\"src_user_role\",\"user_id\",\"user_role\",\"vendor_account\"]}",
    "drilldown_earliest": "1740226500.000000000",
    "drilldown_latest": "1740240900.000000000",
    "_mkv_child": "0",
    "annotations._all": "Credential Access",
    "annotations._frameworks": "mitre_attack",
    "dest_risk_object_type": "system",
    "dest_risk_score": "0",
    "disposition": "disposition:6",
    "disposition_default": "true",
    "disposition_description": "Event disposition has not been set.",
    "disposition_label": "Undetermined",
    "dvc_risk_object_type": "system",
    "dvc_risk_score": "0",
    "notable_type": "notable",
    "orig_host_risk_object_type": "system",
    "orig_host_risk_score": "0",
    "owner": "unassigned",
    "owner_realname": "unassigned",
    "priority": "unknown",
    "risk_score": "0",
    "severities": "low",
    "src_risk_object_type": "system",
    "src_risk_score": [
      "0",
      "0"
    ],
    "status": "1",
    "status_default": "true",
    "status_description": "Event has not been reviewed.",
    "status_end": "false",
    "status_group": "New",
    "status_label": "New",
    "urgency": "low",
    "user_risk_object_type": "user",
    "user_risk_score": "0",
    "webUrl": "https://es-batelco.splunkcloud.com/en-GB/app/SplunkEnterpriseSecuritySuite/incident_review?earliest=-7d%40h&latest=now&search=event_id%3DFB7D9A4E-8588-4C7F-98BA-C452FC2EFF55@@notable@@31854ec2b3a5a7939e2abed1e7b0bfec"
  }
}]