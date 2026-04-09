from app.scoring.confidence import compute_confidence


def _baseline_inputs():
    raw = {
        "alert_id": "test-1",
        "severity": "high",
        "title": "Test",
        "description": "A reasonably long description string with details",
        "source_ip": "10.0.0.42",
        "host": "DC-01.example.com",
    }
    ocsf = {
        "class_uid": 2004,
        "class_name": "Detection Finding",
        "activity_id": 1,
        "severity_id": 4,
        "time": "2026-04-09T00:00:00Z",
        "type_uid": 200401,
        "metadata": {
            "version": "1.7.0",
            "product": {"name": "Splunk", "vendor_name": "Splunk"},
        },
        "finding_info": {"title": "Test", "uid": "abc-123"},
    }
    return raw, ocsf


def test_confidence_no_penalty_when_no_hallucinations():
    raw, ocsf = _baseline_inputs()
    result = compute_confidence(raw, ocsf, "splunk", hallucinations_stripped=[])
    assert result.breakdown["post_process_penalty"] == 0.0


def test_confidence_no_penalty_when_argument_omitted():
    raw, ocsf = _baseline_inputs()
    result = compute_confidence(raw, ocsf, "splunk")
    assert result.breakdown["post_process_penalty"] == 0.0


def test_confidence_one_hallucination_docks_0_10():
    raw, ocsf = _baseline_inputs()
    baseline = compute_confidence(raw, ocsf, "splunk")
    docked = compute_confidence(
        raw, ocsf, "splunk", hallucinations_stripped=["one"]
    )
    assert docked.breakdown["post_process_penalty"] == -0.1
    assert round(baseline.score - docked.score, 3) == 0.1


def test_confidence_three_hallucinations_dock_0_30():
    raw, ocsf = _baseline_inputs()
    baseline = compute_confidence(raw, ocsf, "splunk")
    docked = compute_confidence(
        raw, ocsf, "splunk",
        hallucinations_stripped=["a", "b", "c"],
    )
    assert docked.breakdown["post_process_penalty"] == -0.3
    assert round(baseline.score - docked.score, 3) == 0.3


def test_confidence_penalty_capped_at_0_30_with_more_hallucinations():
    raw, ocsf = _baseline_inputs()
    docked = compute_confidence(
        raw, ocsf, "splunk",
        hallucinations_stripped=["a", "b", "c", "d", "e"],
    )
    assert docked.breakdown["post_process_penalty"] == -0.3


def test_confidence_clamped_to_zero_when_penalty_exceeds_score():
    raw = {"x": "y"}
    ocsf = {}
    result = compute_confidence(
        raw, ocsf, "splunk", hallucinations_stripped=["a", "b", "c"]
    )
    assert result.score >= 0.0


def test_confidence_decision_drops_to_review_when_penalty_pushes_below_threshold():
    raw, ocsf = _baseline_inputs()
    baseline = compute_confidence(raw, ocsf, "splunk")
    docked = compute_confidence(
        raw, ocsf, "splunk",
        hallucinations_stripped=["a", "b", "c"],
    )
    assert docked.score < baseline.score
    assert docked.decision in ("review", "reject", "accept")
    assert docked.score == max(0.0, min(1.0, baseline.score - 0.3))
