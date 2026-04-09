#!/usr/bin/env bash
#
# scripts/smoke-test.sh — end-to-end sanity check against a running stack.
#
# Assumes `docker compose up -d` has already been run. Waits for the
# backend to be healthy, submits a sample alert, polls until terminal,
# and reports pass/fail.
#
# Usage:
#   ./scripts/smoke-test.sh                 # against localhost:3000
#   API_URL=https://staging.example.com/api ./scripts/smoke-test.sh
#
# No Node deps — pure curl + jq.

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api}"
API_KEY="${API_KEY:-${SMOKE_API_KEY:-}}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-180}"
POLL_TIMEOUT_SECONDS="${POLL_TIMEOUT_SECONDS:-180}"

if [[ -z "$API_KEY" ]]; then
  echo "ERROR: API_KEY env var is required (the value of API_KEY in your .env)" >&2
  exit 2
fi

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required tool '$1' not found in PATH" >&2
    exit 2
  fi
}
require curl
require jq

# ── 1. Wait for /health to return ok ───────────────────────────────────
echo "→ Waiting for backend at $API_URL/health (max ${WAIT_TIMEOUT_SECONDS}s)..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT_SECONDS ))
while :; do
  if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
    echo "  backend is up"
    break
  fi
  if (( $(date +%s) >= deadline )); then
    echo "ERROR: backend did not become healthy within ${WAIT_TIMEOUT_SECONDS}s" >&2
    exit 1
  fi
  sleep 2
done

# ── 2. Submit a sample alert ──────────────────────────────────────────
echo "→ Submitting sample alert to $API_URL/logs/ingest..."
SAMPLE_PAYLOAD='{
  "source": "crowdstrike",
  "rawContent": {
    "alert_id": "smoke-test-1",
    "severity": "high",
    "title": "Smoke test alert"
  }
}'

INGEST_RESPONSE="$(curl -fsS \
  -X POST "$API_URL/logs/ingest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -d "$SAMPLE_PAYLOAD")"

JOB_ID="$(echo "$INGEST_RESPONSE" | jq -r '.jobId')"
JOB_STATUS="$(echo "$INGEST_RESPONSE" | jq -r '.status')"

if [[ "$JOB_ID" == "null" || -z "$JOB_ID" ]]; then
  echo "ERROR: ingest did not return a jobId. Response: $INGEST_RESPONSE" >&2
  exit 1
fi

echo "  enqueued: jobId=$JOB_ID status=$JOB_STATUS"

# ── 3. Poll until terminal ─────────────────────────────────────────────
echo "→ Polling /normalize/jobs/$JOB_ID (max ${POLL_TIMEOUT_SECONDS}s)..."
deadline=$(( $(date +%s) + POLL_TIMEOUT_SECONDS ))
last_status=""
while :; do
  ROW="$(curl -fsS \
    "$API_URL/normalize/jobs/$JOB_ID" \
    -H "x-api-key: $API_KEY")"
  STATUS="$(echo "$ROW" | jq -r '.status')"

  if [[ "$STATUS" != "$last_status" ]]; then
    echo "  status: $STATUS"
    last_status="$STATUS"
  fi

  case "$STATUS" in
    COMPLETED)
      DECISION="$(echo "$ROW" | jq -r '.result.decision // "?"')"
      CONFIDENCE="$(echo "$ROW" | jq -r '.result.confidence // "?"')"
      echo
      echo "✓ SMOKE TEST PASSED"
      echo "  decision:   $DECISION"
      echo "  confidence: $CONFIDENCE"
      exit 0
      ;;
    FAILED)
      ERR="$(echo "$ROW" | jq -r '.error // "(no message)"')"
      echo
      echo "✗ SMOKE TEST FAILED — job ended in FAILED" >&2
      echo "  error: $ERR" >&2
      exit 1
      ;;
  esac

  if (( $(date +%s) >= deadline )); then
    echo
    echo "✗ SMOKE TEST FAILED — job did not reach terminal state within ${POLL_TIMEOUT_SECONDS}s" >&2
    echo "  last status: $STATUS" >&2
    exit 1
  fi
  sleep 2
done
