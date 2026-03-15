from app.constants import SYSTEM_PROMPT

def build_prompt(raw_log, source: str, format: str,  examples: list[dict] | None = None) -> list: 
    message = []
    
    message.append(_make_system_prompt())

    if examples: 
        for example in examples:
            example = _add_example(example['raw_log'], example['ocsf'], example["source"])
            message.extend(example)
            
    message.append(_make_log_prompt(source, raw_log))

    return message


def _make_system_prompt() -> dict:
    return {"role": "system", "content": SYSTEM_PROMPT}

def _add_example(log, ocsf, source) -> list:

    user_prompt = f"Normalize this {source} security alert to OCSF Detection Finding format.\n\n{log}"
    assistant_prompt = f"{ocsf}"

    return [{"role": "user", "content": user_prompt}, {"role": "assistant", "content": assistant_prompt}]


def _make_log_prompt(source, raw_log) -> dict:
    prompt = f"""Normalize this {source} security alert to OCSF Detection Finding format.\n\n{raw_log}"""
    
    return {"role": "user", "content": prompt}
