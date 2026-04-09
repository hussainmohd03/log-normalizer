from app.postprocess.rules.enrichment import (
    enrich_email_from_raw_alert,
    force_metadata_version,
    force_vendor_name,
    run_enrichment_rules,
)


def test_force_metadata_version_sets_when_missing():
    ocsf = {}
    result = force_metadata_version(ocsf)
    assert ocsf["metadata"]["version"] == "1.7.0"
    assert result.fixes == ["forced metadata.version to 1.7.0"]


def test_force_metadata_version_overwrites_wrong_value():
    ocsf = {"metadata": {"version": "1.1.0"}}
    result = force_metadata_version(ocsf)
    assert ocsf["metadata"]["version"] == "1.7.0"
    assert result.fixes == ["forced metadata.version to 1.7.0"]


def test_force_metadata_version_no_op_when_correct():
    ocsf = {"metadata": {"version": "1.7.0"}}
    result = force_metadata_version(ocsf)
    assert result.fixes == []


def test_force_metadata_version_creates_metadata_when_not_dict():
    ocsf = {"metadata": "garbage"}
    result = force_metadata_version(ocsf)
    assert ocsf["metadata"] == {"version": "1.7.0"}
    assert result.fixes == ["forced metadata.version to 1.7.0"]


def test_force_vendor_name_fills_when_missing():
    ocsf = {}
    result = force_vendor_name(ocsf, "crowdstrike")
    assert ocsf["metadata"]["product"]["vendor_name"] == "CrowdStrike"
    assert "set metadata.product.vendor_name to CrowdStrike" in result.fixes[0]


def test_force_vendor_name_overrides_unknown():
    ocsf = {"metadata": {"product": {"vendor_name": "Unknown"}}}
    result = force_vendor_name(ocsf, "splunk")
    assert ocsf["metadata"]["product"]["vendor_name"] == "Splunk"
    assert result.fixes


def test_force_vendor_name_no_op_when_already_set():
    ocsf = {"metadata": {"product": {"vendor_name": "CrowdStrike"}}}
    result = force_vendor_name(ocsf, "crowdstrike")
    assert result.fixes == []


def test_force_vendor_name_no_op_for_unknown_source():
    ocsf = {}
    result = force_vendor_name(ocsf, "made-up-siem")
    assert "metadata" not in ocsf
    assert result.fixes == []


def test_force_vendor_name_sentinel_resolves_to_microsoft():
    ocsf = {}
    force_vendor_name(ocsf, "sentinel")
    assert ocsf["metadata"]["product"]["vendor_name"] == "Microsoft"


def test_enrich_email_no_op_when_no_email_evidence():
    ocsf = {"evidences": [{"process": {"name": "p"}}]}
    raw = {"entities": [{"kind": "MailMessage", "properties": {"internetMessageId": "abc"}}]}
    result = enrich_email_from_raw_alert(ocsf, raw)
    assert result.fixes == []


def test_enrich_email_no_op_when_no_mail_entities():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {"entities": [{"kind": "Account", "properties": {}}]}
    result = enrich_email_from_raw_alert(ocsf, raw)
    assert result.fixes == []


def test_enrich_email_populates_message_uid_from_sentinel():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {
        "entities": [
            {
                "kind": "MailMessage",
                "properties": {"internetMessageId": "<msg-1@example.com>"},
            }
        ]
    }
    result = enrich_email_from_raw_alert(ocsf, raw)
    assert ocsf["evidences"][0]["email"]["message_uid"] == "<msg-1@example.com>"
    assert any("message_uid" in f for f in result.fixes)


def test_enrich_email_populates_x_originating_ip_from_sender_ip():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {
        "entities": [
            {"kind": "MailMessage", "properties": {"senderIP": "203.0.113.42"}}
        ]
    }
    result = enrich_email_from_raw_alert(ocsf, raw)
    assert ocsf["evidences"][0]["email"]["x_originating_ip"] == ["203.0.113.42"]
    assert any("x_originating_ip" in f for f in result.fixes)


def test_enrich_email_populates_both_fields_one_log_line():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {
        "entities": [
            {
                "kind": "MailMessage",
                "properties": {
                    "internetMessageId": "<msg-1@example.com>",
                    "senderIP": "203.0.113.42",
                },
            }
        ]
    }
    result = enrich_email_from_raw_alert(ocsf, raw)
    email = ocsf["evidences"][0]["email"]
    assert email["message_uid"] == "<msg-1@example.com>"
    assert email["x_originating_ip"] == ["203.0.113.42"]
    assert len(result.fixes) == 1
    assert "message_uid" in result.fixes[0]
    assert "x_originating_ip" in result.fixes[0]


def test_enrich_email_does_not_overwrite_existing_fields():
    ocsf = {
        "evidences": [
            {
                "email": {
                    "to": ["a@x.y"],
                    "message_uid": "<existing>",
                    "x_originating_ip": ["1.1.1.1"],
                }
            }
        ]
    }
    raw = {
        "entities": [
            {
                "kind": "MailMessage",
                "properties": {
                    "internetMessageId": "<new>",
                    "senderIP": "2.2.2.2",
                },
            }
        ]
    }
    result = enrich_email_from_raw_alert(ocsf, raw)
    email = ocsf["evidences"][0]["email"]
    assert email["message_uid"] == "<existing>"
    assert email["x_originating_ip"] == ["1.1.1.1"]
    assert result.fixes == []


def test_enrich_email_handles_capitalized_field_names():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {
        "entities": [
            {
                "kind": "MailMessage",
                "properties": {
                    "InternetMessageId": "<cap>",
                    "SenderIP": "9.9.9.9",
                },
            }
        ]
    }
    enrich_email_from_raw_alert(ocsf, raw)
    email = ocsf["evidences"][0]["email"]
    assert email["message_uid"] == "<cap>"
    assert email["x_originating_ip"] == ["9.9.9.9"]


def test_enrich_email_finds_entities_under_alert_key():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    raw = {
        "alert": {
            "entities": [
                {"kind": "MailMessage", "properties": {"internetMessageId": "<x>"}}
            ]
        }
    }
    enrich_email_from_raw_alert(ocsf, raw)
    assert ocsf["evidences"][0]["email"]["message_uid"] == "<x>"


def test_enrich_email_pairs_multiple_emails_with_multiple_entities():
    ocsf = {
        "evidences": [
            {"email": {"to": ["a@x.y"]}},
            {"email": {"to": ["b@x.y"]}},
        ]
    }
    raw = {
        "entities": [
            {"kind": "MailMessage", "properties": {"internetMessageId": "<one>"}},
            {"kind": "MailMessage", "properties": {"internetMessageId": "<two>"}},
        ]
    }
    enrich_email_from_raw_alert(ocsf, raw)
    assert ocsf["evidences"][0]["email"]["message_uid"] == "<one>"
    assert ocsf["evidences"][1]["email"]["message_uid"] == "<two>"


def test_enrich_email_no_op_when_raw_alert_missing():
    ocsf = {"evidences": [{"email": {"to": ["a@x.y"]}}]}
    result = enrich_email_from_raw_alert(ocsf, {})
    assert result.fixes == []


def test_run_enrichment_rules_dispatches_all_three():
    ocsf = {
        "evidences": [{"email": {"to": ["a@x.y"]}}],
    }
    raw = {
        "entities": [
            {"kind": "MailMessage", "properties": {"internetMessageId": "<id>"}}
        ]
    }
    result = run_enrichment_rules(ocsf, raw, source="sentinel")
    assert ocsf["metadata"]["version"] == "1.7.0"
    assert ocsf["metadata"]["product"]["vendor_name"] == "Microsoft"
    assert ocsf["evidences"][0]["email"]["message_uid"] == "<id>"
    assert len(result.fixes) >= 3
