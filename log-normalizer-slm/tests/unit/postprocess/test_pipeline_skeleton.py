from app.postprocess import PostProcessor, PostProcessResult


def test_process_returns_postprocess_result():
    pp = PostProcessor()
    result = pp.process({"hello": "world"}, raw_alert={}, source="splunk")
    assert isinstance(result, PostProcessResult)


def test_process_does_not_mutate_caller_dict():
    pp = PostProcessor()
    original = {"a": 1, "nested": {"b": 2}}
    pp.process(original, raw_alert={}, source="splunk")
    assert original == {"a": 1, "nested": {"b": 2}}


def test_process_returns_cleaned_dict_independent_from_caller():
    pp = PostProcessor()
    caller = {"a": 1}
    result = pp.process(caller, raw_alert={}, source="splunk")
    result.cleaned_ocsf["a"] = 999
    assert caller["a"] == 1


def test_process_pipeline_runs_clean_input_through_all_stages():
    pp = PostProcessor()
    result = pp.process(
        {"metadata": {"version": "1.7.0", "product": {"vendor_name": "Splunk"}}},
        raw_alert={},
        source="splunk",
    )
    assert result.cleaned_ocsf["metadata"]["version"] == "1.7.0"
    assert result.cleaned_ocsf["metadata"]["product"]["vendor_name"] == "Splunk"
    assert result.fixes_applied == []
    assert result.hallucinations_stripped == []
