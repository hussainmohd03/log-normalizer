#!/usr/bin/env python
"""
OCSF Detection Finding Labeler
================================
Reads raw security vendor logs (JSONL or JSON array) and produces
OCSF-compliant Detection Finding (class_uid 2004) labeled pairs.

Usage:
    python label.py --input raw_alerts.json --output labeled.jsonl
    python label.py --input raw_alerts.json --output labeled.jsonl --dry-run
    python label.py --input labeled.jsonl --validate
"""

import argparse
import io
import json
import logging
import os
import sys
from collections import defaultdict

# Ensure stdout handles Unicode on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Make `labeling` importable regardless of CWD
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from labeling.vendors.crowdstrike import CrowdStrikeMapper
from labeling.vendors.splunk import SplunkMapper
from labeling.vendors.palo_alto import PaloAltoMapper
from labeling.vendors.microsoft_defender import MicrosoftDefenderMapper
from labeling.vendors.logrhythm import LogRhythmMapper
from labeling.vendors.sentinel import SentinelMapper
from labeling.vendors.trend_micro import TrendMicroMapper
from labeling.vendors.expel import ExpelMapper
from labeling.validate import validate_ocsf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("labeler")

# Source field value → mapper instance
_VENDOR_MAP = {
    "crowdstrike": CrowdStrikeMapper(),
    "splunk": SplunkMapper(),
    # Accept both "paloalto" (actual data) and "palo_alto" (spec)
    "paloalto": PaloAltoMapper(),
    "palo_alto": PaloAltoMapper(),
    # Accept both "microsoft" and "microsoft_defender"
    "microsoft": MicrosoftDefenderMapper(),
    "microsoft_defender": MicrosoftDefenderMapper(),
    "logrhythm": LogRhythmMapper(),
    "sentinel": SentinelMapper(),
    # Accept both "trendmicro" and "trend_micro"
    "trendmicro": TrendMicroMapper(),
    "trend_micro": TrendMicroMapper(),
    "expel": ExpelMapper(),
}

DRY_RUN_LIMIT = 3  # records per vendor in dry-run mode


def _load_input(path: str) -> list:
    """Load JSONL or JSON array from the given file path."""
    records = []
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()

    if content.startswith("["):
        # JSON array
        data = json.loads(content)
        for item in data:
            # Strip MongoDB _id field — we don't need it in raw_log
            item.pop("_id", None)
            records.append(item)
    else:
        # JSONL: one JSON object per line
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            item.pop("_id", None)
            records.append(item)

    return records


def _process_records(
    records: list,
    dry_run: bool = False,
) -> tuple[list, dict, dict]:
    """
    Process each record through the appropriate vendor mapper.

    Returns:
        (labeled_pairs, per_vendor_counts, per_vendor_skipped)
    """
    labeled = []
    counts = defaultdict(int)
    skipped = defaultdict(int)
    dry_run_seen = defaultdict(int)

    label_counter = 0

    for raw_log in records:
        source = (raw_log.get("source") or "").lower().strip()

        if not source:
            logger.warning("Record missing 'source' field — skipping")
            skipped["_unknown"] += 1
            continue

        mapper = _VENDOR_MAP.get(source)
        if mapper is None:
            logger.error("Unknown vendor source %r — skipping", source)
            skipped[source] += 1
            continue

        # Dry-run: limit per vendor
        if dry_run:
            if dry_run_seen[source] >= DRY_RUN_LIMIT:
                continue
            dry_run_seen[source] += 1

        try:
            ocsf = mapper.map(raw_log)
        except ValueError as exc:
            logger.warning("Skipping %r record: %s", source, exc)
            skipped[source] += 1
            continue
        except Exception as exc:
            logger.error("Unexpected error on %r record: %s", source, exc, exc_info=True)
            skipped[source] += 1
            continue

        label_counter += 1
        label_id = f"label_{label_counter:04d}"

        pair = {
            "id": label_id,
            "source": source,
            "raw_log": raw_log,
            "ocsf": ocsf,
        }
        labeled.append(pair)
        counts[source] += 1

        if dry_run:
            print(f"\n{'='*60}")
            print(f"ID: {label_id}  SOURCE: {source}")
            print(json.dumps(ocsf, indent=2, ensure_ascii=False))

    return labeled, dict(counts), dict(skipped)


def _run_validate(path: str) -> None:
    """Read a labeled JSONL file and validate each OCSF output."""
    total = 0
    failed = 0
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                logger.error("Line %d: JSON parse error: %s", lineno, exc)
                failed += 1
                continue

            total += 1
            ocsf = record.get("ocsf", {})
            errors = validate_ocsf(ocsf)
            if errors:
                failed += 1
                label_id = record.get("id", f"line-{lineno}")
                logger.warning("VALIDATION FAILED [%s]: %d error(s)", label_id, len(errors))
                for err in errors:
                    logger.warning("  • %s", err)

    passed = total - failed
    print(f"\nValidation complete: {total} records — {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


def _print_summary(counts: dict, skipped: dict, total_input: int) -> None:
    total_ok = sum(counts.values())
    total_skip = sum(skipped.values())

    print(f"\n{'='*50}")
    print(f"SUMMARY: {total_input} input records → {total_ok} labeled, {total_skip} skipped")
    print(f"\nSuccessful per vendor:")
    for vendor, cnt in sorted(counts.items()):
        print(f"  {vendor:<25} {cnt:>4}")
    if skipped:
        print(f"\nSkipped per vendor:")
        for vendor, cnt in sorted(skipped.items()):
            print(f"  {vendor:<25} {cnt:>4}")
    print("=" * 50)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Label raw vendor logs as OCSF Detection Findings"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to input JSONL or JSON array file",
    )
    parser.add_argument(
        "--output", "-o",
        help="Path to output JSONL file (required unless --dry-run or --validate)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=f"Process up to {DRY_RUN_LIMIT} records per vendor, print output, no file write",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate an existing labeled JSONL file (use --input to specify it)",
    )

    args = parser.parse_args()

    # --- Validate mode ---
    if args.validate:
        logger.info("Validating labeled file: %s", args.input)
        _run_validate(args.input)
        return

    # --- Normal / dry-run mode ---
    if not args.dry_run and not args.output:
        parser.error("--output is required unless --dry-run or --validate is specified")

    logger.info("Loading input: %s", args.input)
    records = _load_input(args.input)
    logger.info("Loaded %d records", len(records))

    if args.dry_run:
        logger.info("DRY RUN — showing up to %d records per vendor", DRY_RUN_LIMIT)

    labeled, counts, skipped = _process_records(records, dry_run=args.dry_run)

    if not args.dry_run and args.output:
        out_dir = os.path.dirname(args.output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            for pair in labeled:
                f.write(json.dumps(pair, ensure_ascii=False) + "\n")
        logger.info("Wrote %d labeled pairs to: %s", len(labeled), args.output)

    _print_summary(counts, skipped, len(records))


if __name__ == "__main__":
    main()
