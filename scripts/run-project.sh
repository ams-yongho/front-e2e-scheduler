#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_NAME="$1"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECT_NAME"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] Project not found: $PROJECT_NAME" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
RESULTS_DIR="$REPO_ROOT/results/$PROJECT_NAME"
RESULTS_FILE="$RESULTS_DIR/$DATE.json"
PW_OUTPUT="/tmp/pw-${PROJECT_NAME}-${DATE}.json"

mkdir -p "$RESULTS_DIR"

echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."

bash "$PROJECT_DIR/run.sh" "$PW_OUTPUT"

node "$SCRIPT_DIR/parse-pw-results.js" "$PW_OUTPUT" "$PROJECT_NAME" "$DATE" > "$RESULTS_FILE"
echo "[$(date -u +%H:%M:%S)] Results saved: $RESULTS_FILE"

# .env 로드 (있는 경우)
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

node "$SCRIPT_DIR/slack-notify.js" "$RESULTS_FILE"
echo "[$(date -u +%H:%M:%S)] Slack notification sent for $PROJECT_NAME"
