from app.postprocess.rules.structural import (
    fix_evidence_network_nesting,
    move_device_account_to_owner,
    move_root_fields_from_finding_info,
    run_structural_rules,
    strip_metadata_invented_fields,
)


def test_move_root_fields_severity_id_only_in_finding_info():
    ocsf = {"finding_info": {"severity_id": 4}}
    result = move_root_fields_from_finding_info(ocsf)
    assert ocsf == {"severity_id": 4, "finding_info": {}}
    assert result.fixes == ["moved finding_info.severity_id to root"]


def test_move_root_fields_handles_multiple_in_one_pass():
    ocsf = {
        "finding_info": {
            "severity_id": 4,
            "severity": "High",
            "status": "New",
            "time": 1700000000,
            "title": "real finding_info field",
        }
    }
    result = move_root_fields_from_finding_info(ocsf)
    assert ocsf["severity_id"] == 4
    assert ocsf["severity"] == "High"
    assert ocsf["status"] == "New"
    assert ocsf["time"] == 1700000000
    assert ocsf["finding_info"] == {"title": "real finding_info field"}
    assert len(result.fixes) == 4


def test_move_root_fields_root_value_wins_on_conflict():
    ocsf = {"severity_id": 4, "finding_info": {"severity_id": 1, "title": "x"}}
    result = move_root_fields_from_finding_info(ocsf)
    assert ocsf["severity_id"] == 4
    assert ocsf["finding_info"] == {"title": "x"}
    assert result.fixes == [
        "dropped duplicate finding_info.severity_id (root value kept)"
    ]


def test_move_root_fields_no_op_when_clean():
    ocsf = {"severity_id": 4, "finding_info": {"title": "x"}}
    result = move_root_fields_from_finding_info(ocsf)
    assert result.fixes == []


def test_move_root_fields_no_op_when_finding_info_missing():
    ocsf = {"severity_id": 4}
    result = move_root_fields_from_finding_info(ocsf)
    assert result.fixes == []


def test_move_root_fields_no_op_when_finding_info_not_a_dict():
    ocsf = {"finding_info": "not-a-dict"}
    result = move_root_fields_from_finding_info(ocsf)
    assert result.fixes == []


def test_fix_evidence_network_flattens_src_endpoint():
    ocsf = {
        "evidences": [
            {"network": {"src_endpoint": {"ip": "10.0.0.1", "port": 443}}}
        ]
    }
    result = fix_evidence_network_nesting(ocsf)
    assert ocsf["evidences"][0]["src_endpoint"] == {"ip": "10.0.0.1", "port": 443}
    assert "network" not in ocsf["evidences"][0]
    assert "flattened evidences[0].network.src_endpoint" in result.fixes
    assert "stripped evidences[0].network wrapper" in result.fixes


def test_fix_evidence_network_preserves_existing_src_endpoint():
    ocsf = {
        "evidences": [
            {
                "src_endpoint": {"ip": "1.1.1.1"},
                "network": {"src_endpoint": {"ip": "2.2.2.2"}},
            }
        ]
    }
    result = fix_evidence_network_nesting(ocsf)
    assert ocsf["evidences"][0]["src_endpoint"] == {"ip": "1.1.1.1"}
    assert "network" not in ocsf["evidences"][0]
    assert "stripped evidences[0].network wrapper" in result.fixes
    assert all("flattened" not in f for f in result.fixes)


def test_fix_evidence_network_strips_empty_network_wrapper():
    ocsf = {"evidences": [{"network": {}}]}
    result = fix_evidence_network_nesting(ocsf)
    assert "network" not in ocsf["evidences"][0]
    assert result.fixes == ["stripped evidences[0].network wrapper"]


def test_fix_evidence_network_no_op_when_evidences_missing():
    ocsf = {}
    result = fix_evidence_network_nesting(ocsf)
    assert result.fixes == []


def test_fix_evidence_network_no_op_when_evidences_not_list():
    ocsf = {"evidences": "not-a-list"}
    result = fix_evidence_network_nesting(ocsf)
    assert result.fixes == []


def test_fix_evidence_network_handles_malformed_evidence_entry():
    ocsf = {"evidences": [{"valid": True}, "garbage", None, {"network": {"src_endpoint": {}}}]}
    result = fix_evidence_network_nesting(ocsf)
    assert "src_endpoint" in ocsf["evidences"][3]
    assert any("evidences[3]" in f for f in result.fixes)


def test_move_device_account_to_owner_creates_owner_when_missing():
    ocsf = {"device": {"hostname": "host1", "account": {"name": "alice"}}}
    result = move_device_account_to_owner(ocsf)
    assert ocsf["device"]["owner"] == {"account": {"name": "alice"}}
    assert "account" not in ocsf["device"]
    assert result.fixes == ["moved device.account to device.owner.account"]


def test_move_device_account_to_owner_attaches_to_existing_owner():
    ocsf = {
        "device": {
            "owner": {"name": "alice"},
            "account": {"name": "alice", "uid": "u1"},
        }
    }
    result = move_device_account_to_owner(ocsf)
    assert ocsf["device"]["owner"] == {
        "name": "alice",
        "account": {"name": "alice", "uid": "u1"},
    }
    assert "account" not in ocsf["device"]
    assert result.fixes == ["moved device.account to device.owner.account"]


def test_move_device_account_to_owner_drops_when_owner_account_already_set():
    ocsf = {
        "device": {
            "owner": {"account": {"name": "existing"}},
            "account": {"name": "duplicate"},
        }
    }
    result = move_device_account_to_owner(ocsf)
    assert ocsf["device"]["owner"]["account"] == {"name": "existing"}
    assert "account" not in ocsf["device"]
    assert result.fixes == [
        "dropped device.account (device.owner.account already set)"
    ]


def test_move_device_account_to_owner_no_op_when_no_account():
    ocsf = {"device": {"hostname": "host1"}}
    result = move_device_account_to_owner(ocsf)
    assert result.fixes == []


def test_move_device_account_to_owner_no_op_when_device_missing():
    ocsf = {}
    result = move_device_account_to_owner(ocsf)
    assert result.fixes == []


def test_move_device_account_to_owner_no_op_when_device_not_dict():
    ocsf = {"device": "not-a-dict"}
    result = move_device_account_to_owner(ocsf)
    assert result.fixes == []


def test_strip_metadata_invented_fields_removes_created_and_modified_time():
    ocsf = {
        "metadata": {
            "version": "1.7.0",
            "created_time": 100,
            "modified_time": 200,
        }
    }
    result = strip_metadata_invented_fields(ocsf)
    assert ocsf["metadata"] == {"version": "1.7.0"}
    assert "stripped metadata.created_time" in result.fixes
    assert "stripped metadata.modified_time" in result.fixes


def test_strip_metadata_invented_fields_partial():
    ocsf = {"metadata": {"version": "1.7.0", "created_time": 100}}
    result = strip_metadata_invented_fields(ocsf)
    assert ocsf["metadata"] == {"version": "1.7.0"}
    assert result.fixes == ["stripped metadata.created_time"]


def test_strip_metadata_invented_fields_no_op_when_clean():
    ocsf = {"metadata": {"version": "1.7.0"}}
    result = strip_metadata_invented_fields(ocsf)
    assert result.fixes == []


def test_strip_metadata_invented_fields_no_op_when_metadata_missing():
    ocsf = {}
    result = strip_metadata_invented_fields(ocsf)
    assert result.fixes == []


def test_strip_metadata_invented_fields_no_op_when_metadata_not_dict():
    ocsf = {"metadata": "not-a-dict"}
    result = strip_metadata_invented_fields(ocsf)
    assert result.fixes == []


def test_run_structural_rules_dispatches_all_four_rules():
    ocsf = {
        "finding_info": {"severity_id": 4},
        "evidences": [{"network": {"src_endpoint": {"ip": "1.1.1.1"}}}],
        "device": {"account": {"name": "alice"}},
        "metadata": {"version": "1.7.0", "created_time": 100},
    }
    result = run_structural_rules(ocsf)

    assert ocsf["severity_id"] == 4
    assert ocsf["evidences"][0]["src_endpoint"] == {"ip": "1.1.1.1"}
    assert ocsf["device"]["owner"] == {"account": {"name": "alice"}}
    assert ocsf["metadata"] == {"version": "1.7.0"}

    fix_text = " ".join(result.fixes)
    assert "moved finding_info.severity_id" in fix_text
    assert "flattened evidences[0]" in fix_text
    assert "moved device.account" in fix_text
    assert "stripped metadata.created_time" in fix_text
