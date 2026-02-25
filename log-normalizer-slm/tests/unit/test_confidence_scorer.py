from pytest import approx
from app.utils.confidence_scorer import score_confidence
from app.config import settings

def test_score_confidence_perfect_ocsf():
    ocsf = {
        "class_uid": 1001,
        "class_name": "File System Activity",
        "metadata": {"timestamp": "2024-01-01T00:00:00Z"},
        "severity_id": 3,
        "activity_id": 1,
        "type_uid": 100101,
        "file": "example.txt"
    }
    score = score_confidence(ocsf)
    assert score == approx(1.0)


def test_score_confidence_empty_dict():
    ocsf = {}
    score = score_confidence(ocsf)
    assert score == 0.0


def test_score_confidence_severity_zero():
    ocsf = {
        "class_uid": 1001,
        "class_name": "File System Activity",
        "metadata": {"timestamp": "2024-01-01T00:00:00Z"},
        "severity_id": 0,  # Unknown severity
        "activity_id": 1,
        "type_uid": 100101,
        "file": "example.txt"
    }
    score = score_confidence(ocsf)
    assert score > settings.confidence_threshold

def test_score_confidence_invalid_class_uid():
    ocsf = {
        "class_uid": 9999,  # Invalid class_uid
        "class_name": "Unknown Activity",
        "metadata": {"timestamp": "2024-01-01T00:00:00Z"},
        "severity_id": 3,
        "activity_id": 1,
        "type_uid": 999901,  # type_uid that doesn't match the formula for the invalid class_uid
    }
    score = score_confidence(ocsf)
    assert score < settings.confidence_threshold

def test_score_confidence_wrong_type_uid():
    ocsf = {
        "class_uid": 1001,
        "class_name": "File System Activity",
        "metadata": {"timestamp": "2024-01-01T00:00:00Z"},
        "severity_id": 3,
        "activity_id": 1,
        "type_uid": 999999,  # Incorrect type_uid that doesn't follow the formula
        "file": "example.txt"
    }
    score = score_confidence(ocsf)
    assert score < settings.confidence_threshold