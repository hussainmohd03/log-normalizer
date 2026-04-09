from app.postprocess.rules.mitre import (
    fix_mitre_tactic_names,
    fix_mitre_technique_names,
    run_mitre_rules,
)


def test_fix_technique_names_corrects_known_uid():
    ocsf = {
        "finding_info": {
            "attacks": [
                {"technique": {"uid": "T1485", "name": "Rogue Domain Name"}}
            ]
        }
    }
    result = fix_mitre_technique_names(ocsf)
    technique = ocsf["finding_info"]["attacks"][0]["technique"]
    assert technique["name"] == "Data Destruction"
    assert any("T1485" in f for f in result.fixes)


def test_fix_technique_names_no_op_when_already_correct():
    ocsf = {
        "finding_info": {
            "attacks": [
                {"technique": {"uid": "T1485", "name": "Data Destruction"}}
            ]
        }
    }
    result = fix_mitre_technique_names(ocsf)
    assert result.fixes == []


def test_fix_technique_names_handles_list_of_techniques():
    ocsf = {
        "finding_info": {
            "attacks": [
                {
                    "technique": [
                        {"uid": "T1485", "name": "wrong"},
                        {"uid": "T1486", "name": "wrong"},
                    ]
                }
            ]
        }
    }
    result = fix_mitre_technique_names(ocsf)
    techniques = ocsf["finding_info"]["attacks"][0]["technique"]
    assert techniques[0]["name"] == "Data Destruction"
    assert techniques[1]["name"] == "Data Encrypted for Impact"
    assert len(result.fixes) == 2


def test_fix_technique_names_unknown_uid_left_alone():
    ocsf = {
        "finding_info": {
            "attacks": [
                {"technique": {"uid": "T9999", "name": "Made Up"}}
            ]
        }
    }
    result = fix_mitre_technique_names(ocsf)
    technique = ocsf["finding_info"]["attacks"][0]["technique"]
    assert technique["name"] == "Made Up"
    assert result.fixes == []


def test_fix_technique_names_no_op_when_no_attacks():
    ocsf = {"finding_info": {}}
    result = fix_mitre_technique_names(ocsf)
    assert result.fixes == []


def test_fix_technique_names_no_op_when_no_finding_info():
    ocsf = {}
    result = fix_mitre_technique_names(ocsf)
    assert result.fixes == []


def test_fix_tactic_names_corrects_preattack_to_reconnaissance():
    ocsf = {
        "finding_info": {
            "attacks": [
                {"tactic": {"uid": "TA0043", "name": "PreAttack"}}
            ]
        }
    }
    result = fix_mitre_tactic_names(ocsf)
    tactic = ocsf["finding_info"]["attacks"][0]["tactic"]
    assert tactic["name"] == "Reconnaissance"
    assert any("TA0043" in f for f in result.fixes)


def test_fix_tactic_names_handles_list_of_tactics():
    ocsf = {
        "finding_info": {
            "attacks": [
                {
                    "tactic": [
                        {"uid": "TA0001", "name": "wrong"},
                        {"uid": "TA0002", "name": "wrong"},
                    ]
                }
            ]
        }
    }
    result = fix_mitre_tactic_names(ocsf)
    tactics = ocsf["finding_info"]["attacks"][0]["tactic"]
    assert tactics[0]["name"] == "Initial Access"
    assert tactics[1]["name"] == "Execution"
    assert len(result.fixes) == 2


def test_fix_tactic_names_handles_tactics_key_alias():
    ocsf = {
        "finding_info": {
            "attacks": [
                {"tactics": [{"uid": "TA0001", "name": "wrong"}]}
            ]
        }
    }
    result = fix_mitre_tactic_names(ocsf)
    tactic = ocsf["finding_info"]["attacks"][0]["tactics"][0]
    assert tactic["name"] == "Initial Access"
    assert result.fixes


def test_fix_tactic_names_unknown_uid_left_alone():
    ocsf = {
        "finding_info": {
            "attacks": [{"tactic": {"uid": "TA9999", "name": "Made Up"}}]
        }
    }
    result = fix_mitre_tactic_names(ocsf)
    assert ocsf["finding_info"]["attacks"][0]["tactic"]["name"] == "Made Up"
    assert result.fixes == []


def test_fix_tactic_names_no_op_when_no_attacks():
    ocsf = {"finding_info": {}}
    result = fix_mitre_tactic_names(ocsf)
    assert result.fixes == []


def test_run_mitre_rules_dispatches_both():
    ocsf = {
        "finding_info": {
            "attacks": [
                {
                    "technique": {"uid": "T1485", "name": "wrong"},
                    "tactic": {"uid": "TA0040", "name": "wrong"},
                }
            ]
        }
    }
    result = run_mitre_rules(ocsf)
    attack = ocsf["finding_info"]["attacks"][0]
    assert attack["technique"]["name"] == "Data Destruction"
    assert attack["tactic"]["name"] == "Impact"
    assert len(result.fixes) == 2
