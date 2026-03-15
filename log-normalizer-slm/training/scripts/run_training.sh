#!/usr/bin/env bash
# run_training.sh — Full training pipeline for log-normalizer SLM.
#
# Usage (from log-normalizer-slm/training/):
#   bash scripts/run_training.sh
#
# Prerequisite: splits/ must already exist (run prepare_dataset.py first).
# Logs are saved under experiments/<timestamp>/training.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ==== Timestamped experiment directory ==================================================================================================
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
EXPERIMENT_DIR="$TRAINING_DIR/experiments/$TIMESTAMP"
mkdir -p "$EXPERIMENT_DIR"

LOG_FILE="$EXPERIMENT_DIR/training.log"

# Redirect all output to both terminal and log file from this point on
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=========================================="
echo "  Log-Normalizer SLM Training"
echo "  Experiment: $TIMESTAMP"
echo "  Log: $LOG_FILE"
echo "=========================================="
echo ""

# ==== Prerequisite checks ================================================================================================================

echo "[1/5] Checking prerequisites..."

# Python
if ! command -v python &>/dev/null; then
    echo "ERROR: python not found in PATH"
    exit 1
fi
echo "  python: $(python --version)"

# GPU
if ! command -v nvidia-smi &>/dev/null; then
    echo "ERROR: nvidia-smi not found. A CUDA GPU is required for training."
    exit 1
fi
echo "  GPU:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/    /'

# Required files
CONFIG="$TRAINING_DIR/config/training_config.yaml"
TRAIN_SPLIT="$TRAINING_DIR/splits/train.jsonl"
VAL_SPLIT="$TRAINING_DIR/splits/val.jsonl"

for f in "$CONFIG" "$TRAIN_SPLIT" "$VAL_SPLIT"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: Required file not found: $f"
        echo "       Run prepare_dataset.py first."
        exit 1
    fi
done

echo "  config: $CONFIG"
echo "  train : $TRAIN_SPLIT ($(wc -l < "$TRAIN_SPLIT") examples)"
echo "  val   : $VAL_SPLIT ($(wc -l < "$VAL_SPLIT") examples)"

# ==== Copy config to experiment directory =================================================================================================

echo ""
echo "[2/5] Copying config to experiment directory..."
cp "$CONFIG" "$EXPERIMENT_DIR/training_config.yaml"
echo "  Saved: $EXPERIMENT_DIR/training_config.yaml"

# ==== Record git state ====================================================================================================================

echo ""
echo "[3/5] Recording git state..."
if git -C "$TRAINING_DIR" rev-parse --git-dir &>/dev/null; then
    git -C "$TRAINING_DIR" log -1 --format="  commit: %H%n  author: %an%n  date:   %ad%n  msg:    %s" \
        >> "$EXPERIMENT_DIR/git_info.txt" 2>/dev/null || true
    git -C "$TRAINING_DIR" diff --stat HEAD >> "$EXPERIMENT_DIR/git_info.txt" 2>/dev/null || true
    echo "  Saved: $EXPERIMENT_DIR/git_info.txt"
else
    echo "  (not a git repo, skipping)"
fi

# ==== Train ===============================================================================================================================

echo ""
echo "[4/5] Starting training..."
TRAIN_START=$(date +%s)
cd "$TRAINING_DIR"
python train.py
TRAIN_END=$(date +%s)
DURATION=$(( TRAIN_END - TRAIN_START ))

# ==== Done =================================================================================================================================

echo ""
echo "[5/5] Training complete."
echo "  Duration: $(( DURATION / 60 ))m $(( DURATION % 60 ))s"
echo "  Experiment dir: $EXPERIMENT_DIR"
echo "  Full log:       $LOG_FILE"
