from app.utils.prompt_builder import build_prompt


def test_prompt_without_examples_contains_source():
    result = build_prompt(raw_log="test log", source="palo-alto", format="json")
    system_msg = result[0]["content"]
    assert "palo-alto" in system_msg

def test_prompt_without_examples_contains_rawlog():
    result = build_prompt(raw_log="test log", source="palo-alto", format="json")
    user_msg = result[-1]["content"]
    assert "test log" in user_msg

def test_prompt_without_examples_does_not_contain_examples():
    result = build_prompt(raw_log="test log", source="palo-alto", format="json")
    assert len(result) == 2

def test_prompt_with_examples_contains_all_examples():
    result = build_prompt(
        raw_log="test log",
        source="palo-alto",
        format="json",
        examples=[
            {"raw_log": "example log 1", "ocsf": '{"example": 1}', "source": "palo-alto", "format": "json"},
            {"raw_log": "example log 2", "ocsf": '{"example": 2}', "source": "palo-alto", "format": "json"},
        ]  
    )
    assert len(result) == 6
    

