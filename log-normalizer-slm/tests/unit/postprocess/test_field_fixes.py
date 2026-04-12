from app.postprocess.rules.field_fixes import (
    fix_email_from_string,
    fix_email_to_list,
    fix_observable_types,
    fix_process_pid_int,
    run_field_fix_rules,
    strip_device_os_string,
    strip_placeholder_values,
)


def test_fix_observable_types_corrects_canonical_name_and_id():
    ocsf = {"observables": [{"type": "ip_address", "value": "1.1.1.1"}]}
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "IP Address"
    assert ocsf["observables"][0]["type_id"] == 2
    assert any("type" in f for f in result.fixes)
    assert any("type_id" in f for f in result.fixes)


def test_fix_observable_types_already_canonical_only_sets_type_id():
    ocsf = {"observables": [{"type": "IP Address", "value": "1.1.1.1"}]}
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "IP Address"
    assert ocsf["observables"][0]["type_id"] == 2
    assert all("type " not in f and "->" not in f for f in result.fixes)


def test_fix_observable_types_infers_from_value_when_type_is_python_name():
    ocsf = {"observables": [{"type": "string", "value": "10.0.0.1"}]}
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "IP Address"
    assert ocsf["observables"][0]["type_id"] == 2
    assert result.fixes


def test_fix_observable_types_infers_email_from_value():
    ocsf = {"observables": [{"type": "string", "value": "alice@example.com"}]}
    fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "Email Address"


def test_fix_observable_types_infers_hash_from_value():
    ocsf = {"observables": [{"type": "string", "value": "a" * 64}]}
    fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "Hash"


def test_fix_observable_types_unknown_type_left_alone():
    ocsf = {"observables": [{"type": "made_up_type", "value": "x"}]}
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "made_up_type"
    assert result.fixes == []


def test_fix_observable_types_no_op_when_observables_missing():
    ocsf = {}
    result = fix_observable_types(ocsf)
    assert result.fixes == []


def test_fix_observable_types_no_op_when_observables_not_list():
    ocsf = {"observables": "not-a-list"}
    result = fix_observable_types(ocsf)
    assert result.fixes == []


def test_fix_observable_types_handles_malformed_entries():
    ocsf = {"observables": [None, "garbage", {"type": "ip_address", "value": "1.1.1.1"}]}
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][2]["type"] == "IP Address"
    assert any("[2]" in f for f in result.fixes)


def test_fix_email_to_list_wraps_string():
    ocsf = {"evidences": [{"email": {"to": "alice@example.com"}}]}
    result = fix_email_to_list(ocsf)
    assert ocsf["evidences"][0]["email"]["to"] == ["alice@example.com"]
    assert result.fixes == ["wrapped evidences[0].email.to as list"]


def test_fix_email_to_list_no_op_when_already_list():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    result = fix_email_to_list(ocsf)
    assert ocsf["evidences"][0]["email"]["to"] == ["a@x.y"]
    assert result.fixes == []


def test_fix_email_to_list_no_op_when_no_email():
    ocsf = {"evidences": [{"process": {"name": "p"}}]}
    result = fix_email_to_list(ocsf)
    assert result.fixes == []


def test_fix_email_to_list_no_op_when_evidences_missing():
    ocsf = {}
    result = fix_email_to_list(ocsf)
    assert result.fixes == []


def test_fix_email_from_string_flattens_dict_to_string():
    ocsf = {
        "evidences": [
            {"email": {"from": {"name": "Alice", "email": "alice@example.com"}}}
        ]
    }
    result = fix_email_from_string(ocsf)
    assert ocsf["evidences"][0]["email"]["from"] == "alice@example.com"
    assert result.fixes == ["flattened evidences[0].email.from to string"]


def test_fix_email_from_string_no_op_when_already_string():
    ocsf = {"evidences": [{"email": {"from": "alice@example.com"}}]}
    result = fix_email_from_string(ocsf)
    assert ocsf["evidences"][0]["email"]["from"] == "alice@example.com"
    assert result.fixes == []


def test_fix_email_from_string_no_op_when_dict_missing_email_key():
    ocsf = {"evidences": [{"email": {"from": {"name": "Alice"}}}]}
    result = fix_email_from_string(ocsf)
    assert ocsf["evidences"][0]["email"]["from"] == {"name": "Alice"}
    assert result.fixes == []


def test_fix_process_pid_int_drops_unspecified():
    ocsf = {"evidences": [{"process": {"pid": "Unspecified"}}]}
    result = fix_process_pid_int(ocsf)
    assert "pid" not in ocsf["evidences"][0]["process"]
    assert result.fixes == ["dropped evidences[0].process.pid (non-numeric)"]


def test_fix_process_pid_int_coerces_numeric_string():
    ocsf = {"evidences": [{"process": {"pid": "1234"}}]}
    result = fix_process_pid_int(ocsf)
    assert ocsf["evidences"][0]["process"]["pid"] == 1234
    assert result.fixes == ["coerced evidences[0].process.pid string -> int"]


def test_fix_process_pid_int_keeps_int_unchanged():
    ocsf = {"evidences": [{"process": {"pid": 5678}}]}
    result = fix_process_pid_int(ocsf)
    assert ocsf["evidences"][0]["process"]["pid"] == 5678
    assert result.fixes == []


def test_fix_process_pid_int_drops_bool():
    ocsf = {"evidences": [{"process": {"pid": True}}]}
    result = fix_process_pid_int(ocsf)
    assert "pid" not in ocsf["evidences"][0]["process"]
    assert result.fixes == ["dropped evidences[0].process.pid (non-numeric)"]


def test_fix_process_pid_int_no_op_when_no_process():
    ocsf = {"evidences": [{"email": {"to": ["x"]}}]}
    result = fix_process_pid_int(ocsf)
    assert result.fixes == []


def test_strip_device_os_string_drops_when_string():
    ocsf = {"device": {"hostname": "h1", "os": "Windows 10"}}
    result = strip_device_os_string(ocsf)
    assert "os" not in ocsf["device"]
    assert result.fixes == ["dropped device.os (was string not object)"]


def test_strip_device_os_string_keeps_when_object():
    ocsf = {"device": {"os": {"name": "Windows", "type_id": 100}}}
    result = strip_device_os_string(ocsf)
    assert ocsf["device"]["os"] == {"name": "Windows", "type_id": 100}
    assert result.fixes == []


def test_strip_device_os_string_no_op_when_no_os():
    ocsf = {"device": {"hostname": "h1"}}
    result = strip_device_os_string(ocsf)
    assert result.fixes == []


def test_strip_device_os_string_no_op_when_device_missing():
    ocsf = {}
    result = strip_device_os_string(ocsf)
    assert result.fixes == []


def test_strip_device_os_string_no_op_when_device_not_dict():
    ocsf = {"device": "not-a-dict"}
    result = strip_device_os_string(ocsf)
    assert result.fixes == []


def test_fix_observable_types_digit_value_not_port_when_name_is_alarm_id():
    ocsf = {
        "observables": [
            {"type": "string", "name": "alarmId", "value": "625892"}
        ]
    }
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0].get("type_id") != 11
    assert result.fixes == []


def test_fix_observable_types_digit_value_is_port_when_name_is_port():
    ocsf = {
        "observables": [
            {"type": "string", "name": "dst_port", "value": "443"}
        ]
    }
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0]["type"] == "Port"
    assert ocsf["observables"][0]["type_id"] == 11
    assert result.fixes


def test_fix_observable_types_digit_value_not_port_when_name_is_rule_name():
    ocsf = {
        "observables": [
            {"type": "integer", "name": "rule_id", "value": "12345"}
        ]
    }
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0].get("type_id") != 11


def test_fix_observable_types_digit_value_not_port_when_name_missing():
    ocsf = {
        "observables": [
            {"type": "string", "value": "625892"}
        ]
    }
    result = fix_observable_types(ocsf)
    assert ocsf["observables"][0].get("type_id") != 11


def test_strip_placeholder_values_removes_unknown_from_evidences():
    ocsf = {
        "evidences": [
            {"url": "Unknown", "ip_addr": "10.0.0.1"}
        ]
    }
    result = strip_placeholder_values(ocsf)
    assert "url" not in ocsf["evidences"][0]
    assert ocsf["evidences"][0]["ip_addr"] == "10.0.0.1"
    assert any("evidences[0].url" in f for f in result.fixes)


def test_strip_placeholder_values_removes_na_variants():
    ocsf = {
        "evidences": [
            {"email_addr": "N/A", "process": {"name": "n/a"}}
        ]
    }
    result = strip_placeholder_values(ocsf)
    assert "email_addr" not in ocsf["evidences"][0]
    assert "name" not in ocsf["evidences"][0]["process"]
    assert len(result.fixes) == 2


def test_strip_placeholder_values_removes_from_metadata():
    ocsf = {
        "metadata": {"product": {"version": "Unspecified", "name": "Splunk"}}
    }
    result = strip_placeholder_values(ocsf)
    assert "version" not in ocsf["metadata"]["product"]
    assert ocsf["metadata"]["product"]["name"] == "Splunk"
    assert any("metadata.product.version" in f for f in result.fixes)


def test_strip_placeholder_values_case_insensitive():
    ocsf = {"evidences": [{"field": "UNKNOWN"}]}
    result = strip_placeholder_values(ocsf)
    assert "field" not in ocsf["evidences"][0]
    assert result.fixes


def test_strip_placeholder_values_matches_none_and_null():
    ocsf = {"evidences": [{"a": "None", "b": "null", "c": "TBD"}]}
    result = strip_placeholder_values(ocsf)
    assert ocsf["evidences"][0] == {}
    assert len(result.fixes) == 3


def test_strip_placeholder_values_no_op_when_no_placeholders():
    ocsf = {
        "evidences": [{"url": "https://example.com"}],
        "metadata": {"version": "1.7.0"},
    }
    result = strip_placeholder_values(ocsf)
    assert result.fixes == []


def test_strip_placeholder_values_no_op_when_sections_missing():
    ocsf = {"device": {"hostname": "h1"}}
    result = strip_placeholder_values(ocsf)
    assert result.fixes == []


def test_strip_placeholder_values_handles_nested_lists():
    ocsf = {
        "evidences": [
            {"nested": [{"inner": "unknown"}]}
        ]
    }
    result = strip_placeholder_values(ocsf)
    assert "inner" not in ocsf["evidences"][0]["nested"][0]
    assert result.fixes


def test_run_field_fix_rules_dispatches_all_five_rules():
    ocsf = {
        "observables": [{"type": "ip_address", "value": "1.1.1.1"}],
        "evidences": [
            {
                "email": {"to": "alice@example.com", "from": {"email": "bob@example.com"}},
                "process": {"pid": "Unspecified"},
            }
        ],
        "device": {"os": "Windows 10"},
    }
    result = run_field_fix_rules(ocsf)
    assert ocsf["observables"][0]["type"] == "IP Address"
    assert ocsf["evidences"][0]["email"]["to"] == ["alice@example.com"]
    assert ocsf["evidences"][0]["email"]["from"] == "bob@example.com"
    assert "pid" not in ocsf["evidences"][0]["process"]
    assert "os" not in ocsf["device"]
    assert len(result.fixes) >= 5
