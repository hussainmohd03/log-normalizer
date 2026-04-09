from app.postprocess.rules.hallucinations import (
    run_hallucination_rules,
    strip_hallucinated_hostname,
    strip_hallucinated_mitre,
    strip_hallucinated_os,
)


def test_strip_mitre_when_raw_has_no_references():
    ocsf = {
        "finding_info": {
            "attacks": [
                {
                    "tactic": {"uid": "TA0001"},
                    "technique": {"uid": "T1199"},
                }
            ]
        }
    }
    raw = {"event": "HTTP anomaly", "src_ip": "10.0.0.1"}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert "attacks" not in ocsf["finding_info"]
    assert len(result.hallucinations) == 1
    assert "MITRE" in result.hallucinations[0]


def test_strip_mitre_no_op_when_raw_has_t_id():
    ocsf = {
        "finding_info": {
            "attacks": [{"technique": {"uid": "T1485"}}]
        }
    }
    raw = {"description": "T1485 detected"}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert ocsf["finding_info"]["attacks"]
    assert result.hallucinations == []


def test_strip_mitre_no_op_when_raw_mentions_attack_keyword():
    ocsf = {"finding_info": {"attacks": [{"technique": {"uid": "T1485"}}]}}
    raw = {"description": "att&ck framework reference"}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert result.hallucinations == []


def test_strip_mitre_no_op_when_raw_mentions_tactic_word():
    ocsf = {"finding_info": {"attacks": [{"technique": {"uid": "T1485"}}]}}
    raw = {"category": "tactic: defense evasion"}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert result.hallucinations == []


def test_strip_mitre_no_op_when_no_attacks():
    ocsf = {"finding_info": {}}
    raw = {}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert result.hallucinations == []


def test_strip_mitre_no_op_when_no_finding_info():
    ocsf = {}
    raw = {}
    result = strip_hallucinated_mitre(ocsf, raw)
    assert result.hallucinations == []


def test_strip_os_when_raw_has_no_references():
    ocsf = {"device": {"hostname": "h1", "os": {"name": "Windows 10", "type_id": 100}}}
    raw = {"src_ip": "10.0.0.1", "alert": "anomaly"}
    result = strip_hallucinated_os(ocsf, raw)
    assert "os" not in ocsf["device"]
    assert "OS" in result.hallucinations[0]


def test_strip_os_no_op_when_raw_has_os_key():
    ocsf = {"device": {"os": {"name": "Windows"}}}
    raw = {"osPlatform": "Win10"}
    result = strip_hallucinated_os(ocsf, raw)
    assert ocsf["device"]["os"] == {"name": "Windows"}
    assert result.hallucinations == []


def test_strip_os_no_op_when_raw_value_mentions_windows():
    ocsf = {"device": {"os": {"name": "Windows"}}}
    raw = {"description": "ransomware on a Windows host"}
    result = strip_hallucinated_os(ocsf, raw)
    assert result.hallucinations == []


def test_strip_os_no_op_when_no_device_os():
    ocsf = {"device": {"hostname": "h1"}}
    raw = {}
    result = strip_hallucinated_os(ocsf, raw)
    assert result.hallucinations == []


def test_strip_os_no_op_when_no_device():
    ocsf = {}
    raw = {}
    result = strip_hallucinated_os(ocsf, raw)
    assert result.hallucinations == []


def test_strip_hostname_when_value_is_email():
    ocsf = {"device": {"hostname": "marwa.faqihi@beyonmoney.com"}}
    raw = {"recipient": "marwa.faqihi@beyonmoney.com"}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert ocsf["device"]["hostname"] is None
    assert "looks like email" in result.hallucinations[0]


def test_strip_hostname_when_not_in_raw_alert():
    ocsf = {"device": {"hostname": "made-up-host.local"}}
    raw = {"src_ip": "10.0.0.1"}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert ocsf["device"]["hostname"] is None
    assert "not in raw alert" in result.hallucinations[0]


def test_strip_hostname_no_op_when_present_in_raw_substring():
    ocsf = {"device": {"hostname": "DC-01"}}
    raw = {"computer": "DC-01.corp.local"}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert ocsf["device"]["hostname"] == "DC-01"
    assert result.hallucinations == []


def test_strip_hostname_case_insensitive_substring_match():
    ocsf = {"device": {"hostname": "DC-01"}}
    raw = {"computer": "dc-01.example.com"}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert ocsf["device"]["hostname"] == "DC-01"
    assert result.hallucinations == []


def test_strip_hostname_no_op_when_no_hostname():
    ocsf = {"device": {"ip": "1.1.1.1"}}
    raw = {}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert result.hallucinations == []


def test_strip_hostname_no_op_when_no_device():
    ocsf = {}
    raw = {}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert result.hallucinations == []


def test_strip_hostname_no_op_when_hostname_empty_string():
    ocsf = {"device": {"hostname": ""}}
    raw = {}
    result = strip_hallucinated_hostname(ocsf, raw)
    assert result.hallucinations == []


def test_run_hallucination_rules_dispatches_all_three():
    ocsf = {
        "finding_info": {"attacks": [{"technique": {"uid": "T1485"}}]},
        "device": {
            "hostname": "user@example.com",
            "os": {"name": "Windows"},
        },
    }
    raw = {"src_ip": "10.0.0.1"}
    result = run_hallucination_rules(ocsf, raw)
    assert "attacks" not in ocsf["finding_info"]
    assert "os" not in ocsf["device"]
    assert ocsf["device"]["hostname"] is None
    assert len(result.hallucinations) == 3
