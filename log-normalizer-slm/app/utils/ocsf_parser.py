import json
import re
from typing import Any



def extract_json(raw_output: str) -> dict[str, Any] | None:

    try: 
        return json.loads(raw_output)
    except json.JSONDecodeError as err: 
        pass

    candidates = []
    # -- Strategy 1 - Fenced output --
    strategy1_output = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_output, re.DOTALL)
    if strategy1_output: 
        candidates.append(strategy1_output.group(1))

    # -- Strategy 2 - Bracket matching -- 
    strategy2_output = _bracket_search(raw_output)
    if strategy2_output:
        candidates.append(strategy2_output)
    
    for candidate in candidates: 
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as err: 
            continue

    return None

    
def _bracket_search(raw_output: str) -> str | None:
    counter = 0
    start = raw_output.find('{')
    if start == -1: 
        return None
    for i in range(start, len(raw_output)):
        element = raw_output[i]
        if element == "{":
            counter += 1 
        elif element == "}":
            counter -= 1
            if counter == 0: 
                return raw_output[start: i + 1]
    
    return None

