"""
extract a valid Python dict. The model might not always return clean JSON. This file handles every realistic variation without crashing.
"""

import ast
import json
import re


def _bracket_match(text: str) -> str | None:
    """
    Walk forward from the first '{', tracking nesting depth.
    Returns the matched substring, or None if brackets never balance.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    for i, ch in enumerate(text[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None  # never balanced


def is_truncated(raw_output: str) -> bool:
    """
    Heuristic: if the bracket counter never reaches zero the JSON was cut off.
    Returns True when output appears truncated (more '{' than '}' after the
    first opening brace).
    """
    start = raw_output.find("{")
    if start == -1:
        return False

    depth = 0
    for ch in raw_output[start:]:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return False  # balanced — not truncated

    return depth > 0  # still open


def extract_json(raw_output: str) -> dict:
    """
    Try to extract a valid JSON object from raw model output.

    Strategies attempted in order:
      1. Fenced block with 'json' label  (```json ... ```)
      2. Fenced block without label      (``` ... ```)
      3. Bracket-matching from first '{'
      4. Full string (when it starts with '{')

    Fallback: single-quoted Python dict via ast.literal_eval.

    Raises ValueError (with an excerpt of raw_output) when all strategies fail.
    """
    candidates: list[str] = []

    # --- Strategy 1: ```json\n{...}\n``` ---
    m = re.search(r"```json\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
    if m:
        candidates.append(m.group(1))

    # --- Strategy 2: ```\n{...}\n``` (no language label) ---
    m = re.search(r"```\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
    if m:
        candidates.append(m.group(1))

    # --- Strategy 3: bracket-matching ---
    bracket = _bracket_match(raw_output)
    if bracket:
        candidates.append(bracket)

    # --- Strategy 4: full string when it starts with '{' ---
    stripped = raw_output.strip()
    if stripped.startswith("{"):
        candidates.append(stripped)

    # Try json.loads on each candidate in turn
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # --- Last resort: single-quoted Python dict ---
    # ast.literal_eval is safe for literals but only apply to model-controlled output.
    for candidate in candidates:
        try:
            result = ast.literal_eval(candidate)
            if isinstance(result, dict):
                # Round-trip through json to normalise types
                return json.loads(json.dumps(result))
        except (ValueError, SyntaxError):
            pass

    # All strategies failed
    excerpt = raw_output[:500]
    raise ValueError(
        f"Could not extract valid JSON from model output. "
        f"First 500 chars of raw output:\n{excerpt}"
    )