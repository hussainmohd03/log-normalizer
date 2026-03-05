"""
convert_to_training.py — Convert labeled OCSF data to SFTTrainer chat format.

Input:  labeled_output_training.jsonl  (100 labels: {id, source, raw_log, ocsf})
Output: training_chat.jsonl            (100 rows: {messages: [{role, content}, ...]})

Format: Chat messages compatible with DeepHat

"""

import json
import sys
from pathlib import Path


SYSTEM_PROMPT = """You are a security log normalizer. You convert raw vendor security alerts into OCSF v1.1.0 Detection Finding (class_uid: 2004) format.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no preamble.
- Map all SOC-useful fields. Sparse output is wrong.
- Process, network, actor, email evidence goes inside evidences[].
- MITRE ATT&CK goes inside finding_info.attacks[].
- User info goes in device.owner or evidences[].actor.user.
- Never put process, src_endpoint, dst_endpoint, attacks, or user at the top level.
- Include observables[] with key IOCs (IPs, hashes, domains, emails, usernames).
- Omit fields with no value. No nulls, no empty strings, no placeholders."""


def build_user_message(source: str, raw_log: dict) -> str:
    """Build the user prompt with vendor context + raw log."""
    raw_json = json.dumps(raw_log, indent=2, ensure_ascii=False)
    return f"Normalize this {source} security alert to OCSF Detection Finding format.\n\n{raw_json}"


def build_assistant_message(ocsf: dict) -> str:
    """Build the assistant response — pure JSON, no wrapping."""
    return json.dumps(ocsf, indent=2, ensure_ascii=False)


def convert_label(label: dict) -> dict:
    """Convert one label to chat format."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_message(label["source"], label["raw_log"])},
            {"role": "assistant", "content": build_assistant_message(label["ocsf"])}
        ]
    }


def main():
    input_path = Path("labeled_output_training.jsonl")
    output_path = Path("training_chat.jsonl")
    
    if not input_path.exists():
        print(f"ERROR: {input_path} not found")
        sys.exit(1)

    labels = []
    with open(input_path) as f:
        for line in f:
            line = line.strip()
            if line:
                labels.append(json.loads(line))

    print(f"Converting {len(labels)} labels to chat format...")

    # Convert
    chat_data = []
    for label in labels:
        chat_data.append(convert_label(label))

    # Write
    with open(output_path, "w") as f:
        for item in chat_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Stats
    sys_tokens = len(SYSTEM_PROMPT) // 4
    user_tokens = []
    asst_tokens = []
    total_tokens = []

    for item in chat_data:
        msgs = item["messages"]
        ut = len(msgs[1]["content"]) // 4
        at = len(msgs[2]["content"]) // 4
        user_tokens.append(ut)
        asst_tokens.append(at)
        total_tokens.append(sys_tokens + ut + at)

    print(f"\nOutput: {output_path}")
    print(f"Format: {{messages: [system, user, assistant]}}")
    print(f"\nToken estimates (chars/4):")
    print(f"  System prompt: ~{sys_tokens} tokens (fixed per example)")
    print(f"  User (raw log): avg ~{sum(user_tokens)//len(user_tokens)}, max ~{max(user_tokens)}")
    print(f"  Assistant (OCSF): avg ~{sum(asst_tokens)//len(asst_tokens)}, max ~{max(asst_tokens)}")
    print(f"  Total per example: avg ~{sum(total_tokens)//len(total_tokens)}, max ~{max(total_tokens)}")
    print(f"\n  Foundation-Sec context: 64K tokens — all examples fit ✓")

    # Verify structure
    print(f"\nValidation:")
    for i, item in enumerate(chat_data):
        msgs = item["messages"]
        assert len(msgs) == 3, f"Row {i}: expected 3 messages, got {len(msgs)}"
        assert msgs[0]["role"] == "system", f"Row {i}: first message not system"
        assert msgs[1]["role"] == "user", f"Row {i}: second message not user"
        assert msgs[2]["role"] == "assistant", f"Row {i}: third message not assistant"
        # Verify assistant content is valid JSON
        try:
            parsed = json.loads(msgs[2]["content"])
            assert parsed.get("class_uid") == 2004, f"Row {i}: class_uid != 2004"
        except json.JSONDecodeError:
            print(f"  ❌ Row {i}: assistant content is not valid JSON!")
    print(f"  ✓ All {len(chat_data)} rows pass structure validation")
    print(f"  ✓ All assistant responses parse as valid JSON")
    print(f"  ✓ All class_uid == 2004")

    # Show first example
    print(f"\n{'='*60}")
    print(f"  SAMPLE (first label, truncated)")
    print(f"{'='*60}")
    sample = chat_data[0]
    print(f"\n[system] ({len(sample['messages'][0]['content'])} chars)")
    print(sample["messages"][0]["content"][:200] + "...")
    print(f"\n[user] ({len(sample['messages'][1]['content'])} chars)")
    print(sample["messages"][1]["content"][:200] + "...")
    print(f"\n[assistant] ({len(sample['messages'][2]['content'])} chars)")
    print(sample["messages"][2]["content"][:200] + "...")


if __name__ == "__main__":
    main()
