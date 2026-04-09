from app.ocsf.enums import ObservableTypeId
from app.postprocess.lookups.mitre import MITRE_TACTICS, MITRE_TECHNIQUES
from app.postprocess.lookups.observable_types import lookup_observable_type
from app.postprocess.lookups.vendors import lookup_vendor


def test_observable_lookup_canonical_name_match():
    result = lookup_observable_type("IP Address")
    assert result == (ObservableTypeId.IP_ADDRESS.value, "IP Address")


def test_observable_lookup_enum_style_name_match():
    result = lookup_observable_type("IP_ADDRESS")
    assert result == (ObservableTypeId.IP_ADDRESS.value, "IP Address")


def test_observable_lookup_case_insensitive():
    result = lookup_observable_type("ip address")
    assert result == (ObservableTypeId.IP_ADDRESS.value, "IP Address")


def test_observable_lookup_strips_whitespace():
    result = lookup_observable_type("  Hostname  ")
    assert result == (ObservableTypeId.HOSTNAME.value, "Hostname")


def test_observable_lookup_unknown_returns_none():
    assert lookup_observable_type("not_a_real_type") is None


def test_observable_lookup_empty_returns_none():
    assert lookup_observable_type("") is None


def test_observable_lookup_covers_every_enum_member():
    for member in ObservableTypeId:
        canonical_hit = lookup_observable_type(member.name)
        assert canonical_hit is not None, f"missing canonical entry for {member.name}"
        assert canonical_hit[0] == member.value


def test_mitre_techniques_contains_known_ids():
    assert MITRE_TECHNIQUES["T1485"] == "Data Destruction"
    assert MITRE_TECHNIQUES["T1566.002"] == "Spearphishing Link"


def test_mitre_tactics_renames_preattack_to_reconnaissance():
    assert MITRE_TACTICS["TA0043"] == "Reconnaissance"


def test_mitre_tables_have_no_duplicate_ids():
    assert len(MITRE_TECHNIQUES) == len(set(MITRE_TECHNIQUES.keys()))
    assert len(MITRE_TACTICS) == len(set(MITRE_TACTICS.keys()))


def test_vendor_lookup_known_source():
    assert lookup_vendor("crowdstrike") == "CrowdStrike"


def test_vendor_lookup_case_insensitive():
    assert lookup_vendor("CROWDSTRIKE") == "CrowdStrike"


def test_vendor_lookup_strips_whitespace():
    assert lookup_vendor("  splunk  ") == "Splunk"


def test_vendor_lookup_sentinel_resolves_to_microsoft():
    assert lookup_vendor("sentinel") == "Microsoft"


def test_vendor_lookup_unknown_returns_none():
    assert lookup_vendor("madeup-siem") is None


def test_vendor_lookup_empty_returns_none():
    assert lookup_vendor("") is None
