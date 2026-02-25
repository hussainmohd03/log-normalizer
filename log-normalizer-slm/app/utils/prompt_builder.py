def build_prompt(raw_log, source: str, format: str,  examples: list[dict] | None = None) -> list: 
    message = []
    
    message.append(_make_system_prompt(source, format))

    if examples: 
        for example in examples:
            example = _add_example(example['raw_log'], example['ocsf'], example["source"], example['format'])
            message.extend(example)
            
    message.append(_make_log_prompt(raw_log))

    return message


def _make_system_prompt(source, format) -> dict:
    prompt = f"""You are a log normalizer. Your job is to normalize the given log produced by {source} in {format} format to OCSF format (Open Cybersecurity Schema Format).
        instructions: 
            - Return ONLY valid JSON. No explanation. No markdown. No code fences.
            - Begin your response immediately with an opening curly bracket. End with a closing curly bracket.                    
            - Place vendor-specific fields that have no OCSF equivalent in an unmapped object. Never invent OCSF field names.                    
            - The required base fields: class_uid, class_name, metadata
            - The type_uid formula: type_uid = class_uid * 100 + activity_id
            - The severity_id enum values (0=Unknown through 6=Fatal, and 99=Other)
            """
    
    return {"role": "system", "content": prompt}

def _add_example(log, ocsf, source, format) -> list:

    user_prompt = f"Normalize this {source} log formatted in {format} format: {log}"
    assistant_prompt = f"{ocsf}"

    return [{"role": "user", "content": user_prompt}, {"role": "assistant", "content": assistant_prompt}]


def _make_log_prompt(raw_log) -> dict:
    prompt = f"""Log to normalize:
        {raw_log}"""
    
    return {"role": "user", "content": prompt}
