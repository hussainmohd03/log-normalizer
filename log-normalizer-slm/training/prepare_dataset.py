import json
import re
import sys
import hashlib
from pathlib import Path

from sklearn.model_selection import train_test_split  # type: ignore[import-untyped]


SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
INPUT_PATH = REPO_ROOT / "data" / "labeled" / "labeled_output_training.jsonl"
TRAINING_CHAT_PATH = REPO_ROOT / "data" / "labeled"  / "training_chat.jsonl"
OUTPUT_DIR = SCRIPT_DIR / "splits"



def validate_example(ex: dict, idx: int, rejected: list) -> bool:
    """Return True if example is valid; otherwise append to rejected and return False."""
    messages = ex.get("messages")
    if not isinstance(messages, list) or len(messages) != 3:
        rejected.append({**ex, "_reject_reason": f"row {idx}: expected 3 messages, got {len(messages) if isinstance(messages, list) else type(messages).__name__}"})
        return False

    roles = [m.get("role") for m in messages]
    if roles != ["system", "user", "assistant"]:
        rejected.append({**ex, "_reject_reason": f"row {idx}: unexpected roles {roles}"})
        return False

    assistant_content = messages[2].get("content", "")
    try:
        parsed = json.loads(assistant_content)
    except json.JSONDecodeError as e:
        rejected.append({**ex, "_reject_reason": f"row {idx}: assistant content not valid JSON: {e}"})
        return False

    if parsed.get("class_uid") != 2004:
        rejected.append({**ex, "_reject_reason": f"row {idx}: class_uid={parsed.get('class_uid')}, expected 2004"})
        return False

    return True


def load_and_validate(path: Path) -> tuple[list, list]:
    """Load JSONL, validate each example. Returns (valid, rejected)."""
    valid = []
    rejected = []

    with open(path, encoding="utf-8") as f:
        for idx, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                ex = json.loads(line)
            except json.JSONDecodeError as e:
                rejected.append({"_raw": line, "_reject_reason": f"row {idx}: JSON parse error: {e}"})
                continue

            if validate_example(ex, idx, rejected):
                valid.append(ex)

    return valid, rejected



def get_vendor(messages: list) -> str:
    user_msg = messages[1]["content"]
    match = re.search(r"Normalize this (\w+) security alert", user_msg)
    return match.group(1) if match else "unknown"



def stratified_split(data: list, vendors: list) -> tuple[list, list, list]:
    train_data, temp_data, _, temp_vendors = train_test_split(
        data, vendors, test_size=0.2, stratify=vendors, random_state=42
    )
    val_data, test_data = train_test_split(
        temp_data, test_size=0.5, stratify=temp_vendors, random_state=42
    )
    return train_data, val_data, test_data



def check_contamination(train_data: list, test_data: list) -> None:
    train_inputs = {ex["messages"][1]["content"] for ex in train_data}
    test_inputs = {ex["messages"][1]["content"] for ex in test_data}
    overlap = train_inputs & test_inputs
    assert len(overlap) == 0, (
        f"CONTAMINATION DETECTED: {len(overlap)} example(s) appear in both train and test"
    )



def write_jsonl(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for ex in data:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")


def write_test_ids(path: Path, test_data: list) -> None:
    """Write SHA256 of each test example's user message for audit trail."""
    with open(path, "w", encoding="utf-8") as f:
        for ex in test_data:
            user_content = ex["messages"][1]["content"]
            digest = hashlib.sha256(user_content.encode("utf-8")).hexdigest()
            f.write(digest + "\n")



def vendor_counts(data: list) -> dict:
    counts: dict[str, int] = {}
    for ex in data:
        v = get_vendor(ex["messages"])
        counts[v] = counts.get(v, 0) + 1
    return dict(sorted(counts.items()))


def check_all_vendors_in_split(split_name: str, split_data: list, all_vendors: set) -> None:
    present = set(vendor_counts(split_data).keys())
    missing = all_vendors - present
    if missing:
        print(f"  WARNING: {split_name} is missing vendors: {missing}")
    else:
        print(f"  {split_name}: all {len(all_vendors)} vendors present")


# ---------------------------
# Main
# ---------------------------

def main() -> None:
    # Resolve input: prefer training_chat.jsonl if it exists
    if TRAINING_CHAT_PATH.exists():
        input_path = TRAINING_CHAT_PATH
    elif INPUT_PATH.exists():
        print(f"training_chat.jsonl not found; reading directly from {INPUT_PATH}")
        print("NOTE: Run convert_to_training.py first to generate training_chat.jsonl")
        input_path = INPUT_PATH
    else:
        print(f"ERROR: No input file found. Expected:\n  {TRAINING_CHAT_PATH}\n  {INPUT_PATH}")
        sys.exit(1)

    print(f"Input: {input_path}")

    # Step 1 — Load & validate
    data, rejected = load_and_validate(input_path)
    print(f"Loaded {len(data)} valid examples, {len(rejected)} rejected")

    if not data:
        print("ERROR: No valid examples to split")
        sys.exit(1)

    # Step 2 — Extract vendors
    vendors = [get_vendor(ex["messages"]) for ex in data]
    all_vendors = set(vendors)
    print(f"Vendors found ({len(all_vendors)}): {sorted(all_vendors)}")

    # Step 3 — Stratified split
    train_data, val_data, test_data = stratified_split(data, vendors)
    print(f"\nSplit sizes: train={len(train_data)}, val={len(val_data)}, test={len(test_data)}")

    # Step 4 — Contamination check (raises on failure)
    check_contamination(train_data, test_data)
    print("Contamination check: PASSED (zero train/test overlap)")

    # Step 5 — Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    write_jsonl(OUTPUT_DIR / "train.jsonl", train_data)
    write_jsonl(OUTPUT_DIR / "val.jsonl", val_data)
    write_jsonl(OUTPUT_DIR / "test.jsonl", test_data)
    write_test_ids(OUTPUT_DIR / "test_ids.txt", test_data)

    if rejected:
        write_jsonl(OUTPUT_DIR / "rejected.jsonl", rejected)
        print(f"Rejected examples saved to: {OUTPUT_DIR / 'rejected.jsonl'}")

    # Vendor distribution per split
    print("\nVendor distribution:")
    for split_name, split_data in [("train", train_data), ("val", val_data), ("test", test_data)]:
        counts = vendor_counts(split_data)
        print(f"  {split_name}: {counts}")

    print("\nAll-vendor coverage check:")
    for split_name, split_data in [("train", train_data), ("val", val_data), ("test", test_data)]:
        check_all_vendors_in_split(split_name, split_data, all_vendors)

    print(f"\nOutput directory: {OUTPUT_DIR}")
    print(f"  train.jsonl  — {len(train_data)} examples")
    print(f"  val.jsonl    — {len(val_data)} examples")
    print(f"  test.jsonl   — {len(test_data)} examples")
    print(f"  test_ids.txt — {len(test_data)} SHA256 hashes (audit trail)")
    if rejected:
        print(f"  rejected.jsonl — {len(rejected)} invalid examples")


if __name__ == "__main__":
    main()
