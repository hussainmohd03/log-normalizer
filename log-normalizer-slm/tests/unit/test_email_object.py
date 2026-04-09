from app.ocsf.objects.email import Email


def test_email_minimal_from_only():
    e = Email.model_validate({"from": "alice@example.com"})
    assert e.from_ == "alice@example.com"
    assert e.message_uid is None
    assert e.x_originating_ip is None


def test_email_accepts_message_uid():
    e = Email.model_validate({
        "from": "alice@example.com",
        "to": ["bob@example.com"],
        "message_uid": "<CAB...@mail.gmail.com>",
    })
    assert e.message_uid == "<CAB...@mail.gmail.com>"


def test_email_accepts_x_originating_ip_as_list():
    e = Email.model_validate({
        "from": "alice@example.com",
        "to": ["bob@example.com"],
        "x_originating_ip": ["203.0.113.42"],
    })
    assert e.x_originating_ip == ["203.0.113.42"]


def test_email_x_originating_ip_must_be_list():
    # Pydantic should reject a bare string for a list[str] field.
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Email.model_validate({
            "from": "alice@example.com",
            "x_originating_ip": "203.0.113.42",
        })


def test_email_ignores_unknown_fields():
    # extra="ignore" should silently drop hallucinated keys.
    e = Email.model_validate({
        "from": "alice@example.com",
        "spf_status": "pass",  # not in OCSF Email object
        "delivery_action": "Delivered",  # not in OCSF Email object
        "hallucinated_field": "noise",
    })
    assert e.from_ == "alice@example.com"
    assert not hasattr(e, "spf_status")
    assert not hasattr(e, "delivery_action")


def test_email_by_alias_round_trip():
    # The `from` alias must survive a model_dump(by_alias=True) round trip.
    e = Email.model_validate({
        "from": "alice@example.com",
        "to": ["bob@example.com"],
        "message_uid": "<CAB...@mail.gmail.com>",
        "x_originating_ip": ["203.0.113.42"],
    })
    dumped = e.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {
        "from": "alice@example.com",
        "to": ["bob@example.com"],
        "message_uid": "<CAB...@mail.gmail.com>",
        "x_originating_ip": ["203.0.113.42"],
    }
    # Round-trip back through validation.
    e2 = Email.model_validate(dumped)
    assert e2.model_dump(by_alias=True, exclude_none=True) == dumped


def test_email_existing_fields_unchanged():
    # Regression: nothing about the existing fields should have shifted.
    e = Email.model_validate({
        "from": "alice@example.com",
        "to": ["bob@example.com", "carol@example.com"],
        "subject": "Q4 numbers",
        "uid": "thread-123",
    })
    assert e.from_ == "alice@example.com"
    assert e.to == ["bob@example.com", "carol@example.com"]
    assert e.subject == "Q4 numbers"
    assert e.uid == "thread-123"
