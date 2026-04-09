"""Wiring tests for the PostProcessor skeleton.

These tests prove the pipeline runs end-to-end with no rules implemented
yet. As Phase 3 lands real rules, dedicated test files in this directory
will cover the rule logic; the assertions here will keep checking that
the pipeline contract (deepcopy, absorb, no mutation of caller's dict)
stays intact.
"""

from app.postprocess import PostProcessor, PostProcessResult


def test_process_returns_postprocess_result():
    pp = PostProcessor()
    result = pp.process({"hello": "world"}, raw_alert={}, source="splunk")
    assert isinstance(result, PostProcessResult)


def test_process_does_not_mutate_caller_dict():
    """The pipeline must deepcopy so a stage that drops a key in
    cleaned_ocsf does not silently drop it from the caller's variable.
    """
    pp = PostProcessor()
    original = {"a": 1, "nested": {"b": 2}}
    pp.process(original, raw_alert={}, source="splunk")
    assert original == {"a": 1, "nested": {"b": 2}}


def test_process_skeleton_emits_no_fixes_or_hallucinations():
    pp = PostProcessor()
    result = pp.process({}, raw_alert={}, source="splunk")
    assert result.fixes_applied == []
    assert result.hallucinations_stripped == []


def test_process_returns_cleaned_dict_keyed_separately_from_caller():
    pp = PostProcessor()
    caller = {"a": 1}
    result = pp.process(caller, raw_alert={}, source="splunk")
    result.cleaned_ocsf["a"] = 999
    assert caller["a"] == 1
