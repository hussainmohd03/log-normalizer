def build_prompt(raw_log, source: str, format: str,  examples: list[dict] | None = None) -> list: 
    message = []
    
    message.append(_make_system_prompt())

    if examples: 
        for example in examples:
            example = _add_example(example['raw_log'], example['ocsf'], example["source"], example['format'])
            message.extend(example)
            
    message.append(_make_log_prompt(source, raw_log))

    return message


def _make_system_prompt() -> dict:
    prompt = f"""You are a security log normalizer. You convert raw vendor security alerts into OCSF v1.1.0 Detection Finding (class_uid: 2004) format.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no preamble.
- Map all SOC-useful fields. Sparse output is wrong.
- Process, network, actor, email evidence goes inside evidences[].
- MITRE ATT&CK goes inside finding_info.attacks[].
- User info goes in device.owner or evidences[].actor.user.
- Never put process, src_endpoint, dst_endpoint, attacks, or user at the top level.
- Place vendor-specific fields that have no OCSF equivalent in an unmapped object. Never invent OCSF field names. 
- Include observables[] with key IOCs (IPs, hashes, domains, emails, usernames).
- The severity_id enum values (0=Unknown through 6=Fatal, and 99=Other)            
- The type_uid formula: type_uid = class_uid * 100 + activity_id
- Omit fields with no value. No nulls, no empty strings, no placeholders.
            """
    
    return {"role": "system", "content": prompt}

def _add_example(log, ocsf, source, format) -> list:

    user_prompt = f"Normalize this {source} log formatted in {format} format: {log}"
    assistant_prompt = f"{ocsf}"

    return [{"role": "user", "content": user_prompt}, {"role": "assistant", "content": assistant_prompt}]


def _make_log_prompt(source, raw_log) -> dict:
    prompt = f"""Normalize this {source} security alert to OCSF Detection Finding format.\n\n{raw_log}"""
    
    return {"role": "user", "content": prompt}
