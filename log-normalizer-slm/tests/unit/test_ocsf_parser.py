from app.utils.ocsf_parser import extract_json

def test_extract_json_clean():
    result = extract_json('{"key": "value"}')
    assert result == {"key": "value"}

def test_extract_json_fenced_with_label():
    result = extract_json('Here is the log: ```json\n{"key": "value"}\n```')
    assert result == {"key": "value"}


def test_extract_json_fenced_without_label():
    result = extract_json('```{"key": "value"}```')
    assert result == {"key": "value"}


def test_extract_json_with_extra_text():
    result = extract_json('Some text before { "key": "value" } some text after')
    assert result == {"key": "value"}


def test_extract_json_broken_string():
    result = extract_json('{"key": "value"')
    assert result is None


def test_extract_json_empty_string():
    result = extract_json('')
    assert result is None

def test_extract_json_no_json():
    result = extract_json('This is not JSON at all.')
    assert result is None

def test_extract_deeply_nested_json():
    result = extract_json('{"level1": {"level2": {"level3": "value"}}}')
    assert result == {"level1": {"level2": {"level3": "value"}}}