"""
retrain_trigger.py - Manual retraining data pipeline.

Not automated, yet

Usage:
    # Export corrections from database
    python retrain_trigger.py --export --db-url $DATABASE_URL
    # Output: corrections.jsonl

    # Merge original training data + corrections
    python retrain_trigger.py --merge \\
      --original training_chat.jsonl \\
      --corrections corrections.jsonl \\
      --output merged.jsonl

    # Then run normal pipeline
    python prepare_dataset.py merged.jsonl
    python train.py


Critical rule: Always retrain from BASE instruct model. Never stack LoRA adapters.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

from app.constants import SYSTEM_PROMPT


# ==== System prompt (must match app/utils/prompt_builder.py exactly) ===========




# ==== Shared helpers ============================================================

def _user_message(source: str, raw_log: str) -> str:
    return f"Normalize this {source} security alert to OCSF Detection Finding format.\n\n{raw_log}"


def _to_chat_example(source: str, raw_log, corrected_ocsf: dict) -> dict:
    raw_str = json.dumps(raw_log, ensure_ascii=False) if isinstance(raw_log, dict) else raw_log
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_message(source, raw_str)},
            {"role": "assistant", "content": json.dumps(corrected_ocsf, ensure_ascii=False)},
        ]
    }


def _sha256_user(example: dict) -> str:
    content = example["messages"][1]["content"]
    # Normalize whitespace to catch near-duplicates
    content = " ".join(content.split())
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _load_jsonl(path: Path) -> list:
    examples = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples


def _write_jsonl(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for ex in data:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")


# ==== --export ===================================================================

def cmd_export(db_url: str, output: Path, dry_run: bool = False) -> None:
    """Pull reviewed corrections from ManualReview table and write as chat JSONL."""
    try:
        import psycopg2  # type: ignore[import-untyped]
        import psycopg2.extras  # type: ignore[import-untyped]
    except ImportError:
        print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
        sys.exit(1)

    if dry_run:
        print("[DRY RUN] Will export corrections but will NOT mark them as exported for training.")

    print("Connecting to database...")
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT mr.id, mr.source, mr."correctedOCSF",
                    rl."rawContent"
                FROM "ManualReview" mr
                JOIN "RawLog" rl ON mr."rawLogId" = rl.id
                WHERE mr."reviewedAt" IS NOT NULL
                AND mr."correctedOCSF" IS NOT NULL
                AND mr."exportedForTraining" = false
                ORDER BY mr.id
            """)
            rows = cur.fetchall()

        print(f"Fetched {len(rows)} reviewed corrections from ManualReview table")

        if not rows:
            print("No reviewed corrections found. Nothing to export.")
            sys.exit(0)

        examples = []
        exported_ids = []
        skipped = 0

        for row in rows:
            row_id = row["id"]
            raw_log = row["rawContent"]       
            source = row["source"]
            corrected = row["correctedOCSF"]

            if isinstance(corrected, str):
                try:
                    corrected = json.loads(corrected)
                except json.JSONDecodeError as e:
                    print(f"  SKIP id={row_id}: corrected_output is not valid JSON: {e}")
                    skipped += 1
                    continue

            if not isinstance(corrected, dict):
                print(f"  SKIP id={row_id}: corrected_output is not a dict (got {type(corrected).__name__})")
                skipped += 1
                continue

            if corrected.get("class_uid") != 2004:
                print(f"  SKIP id={row_id}: class_uid={corrected.get('class_uid')}, expected 2004")
                skipped += 1
                continue

            examples.append(_to_chat_example(source, raw_log, corrected))
            exported_ids.append(row_id)

        print(f"Converted {len(examples)} corrections ({skipped} skipped)")
        _write_jsonl(output, examples)
        print(f"Written to: {output}")

        if exported_ids and not dry_run:
            with conn.cursor() as cur:
                cur.execute(
                    'UPDATE "ManualReview" SET "exportedForTraining" = true WHERE id = ANY(%s)',
                    (exported_ids,)
                )
            conn.commit()
            print(f"Marked {len(exported_ids)} corrections as exportedForTraining=true")
        elif exported_ids and dry_run:
            print(f"[DRY RUN] Skipped marking {len(exported_ids)} corrections as exported for training.")
    finally:
        conn.close()


# ==== --merge ====================================================================

def cmd_merge(original: Path, corrections: Path, output: Path) -> None:
    """
    Merge original training data with human corrections.

    Deduplication key: SHA256 of the user message (i.e. the raw log content).
    When the same log appears in both files, the correction wins.
    """
    print(f"Loading original : {original}")
    originals = _load_jsonl(original)
    print(f"  {len(originals)} examples")

    print(f"Loading corrections: {corrections}")
    corrects = _load_jsonl(corrections)
    print(f"  {len(corrects)} examples")

    # Build ordered map: originals first, then overwrite with corrections
    merged: dict[str, dict] = {}
    for ex in originals:
        merged[_sha256_user(ex)] = ex

    replaced = 0
    added = 0
    for ex in corrects:
        digest = _sha256_user(ex)
        if digest in merged:
            replaced += 1
        else:
            added += 1

        merged[digest] = ex

    result = list(merged.values())
    _write_jsonl(output, result)

    print(f"\nMerge summary:")
    print(f"  Original  : {len(originals)}")
    print(f"  Corrections: {len(corrects)}")
    print(f"  Replaced  : {replaced}  (correction overwrote original for same log)")
    print(f"  New       : {added}  (net new examples from corrections)")
    print(f"  Total out : {len(result)}")
    print(f"Written to: {output}")


# ==== CLI =========================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual retraining data pipeline. Not automated.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--export", action="store_true",
                        help="Export reviewed corrections from ManualReview table")
    parser.add_argument("--dry-run", action="store_true",
                        help="Export without marking corrections as exported for training")
    parser.add_argument("--merge", action="store_true",
                        help="Merge original training data with corrections")
    parser.add_argument("--db-url",
                        help="PostgreSQL connection URL (required for --export)")
    parser.add_argument("--original",
                        help="Original training_chat.jsonl (required for --merge)")
    parser.add_argument("--corrections",
                        help="Corrections JSONL from --export (required for --merge)")
    parser.add_argument("--output", default="corrections.jsonl",
                        help="Output file path (default: corrections.jsonl)")

    args = parser.parse_args()

    if args.export:
        if not args.db_url:
            parser.error("--db-url is required with --export")
        cmd_export(args.db_url, Path(args.output), dry_run=args.dry_run)

    elif args.merge:
        missing = [f for f, v in [("--original", args.original),
                                   ("--corrections", args.corrections),
                                   ("--output", args.output)] if not v]
        if missing:
            parser.error(f"--merge requires: {', '.join(missing)}")
        cmd_merge(Path(args.original), Path(args.corrections), Path(args.output))

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
