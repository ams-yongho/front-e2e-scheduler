#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_NAME="$1"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECT_NAME"
PROJECT_CONFIG="$PROJECT_DIR/config.json"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] Project not found: $PROJECT_NAME" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
RESULTS_DIR="$REPO_ROOT/results/$PROJECT_NAME"
RESULTS_FILE="$RESULTS_DIR/$DATE.json"
PW_OUTPUT="/tmp/pw-${PROJECT_NAME}-${DATE}.json"

mkdir -p "$RESULTS_DIR"

# .env 로드 (있는 경우)
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

# Preflight: Playwright이 사용 가능하지 않으면 의존성 자동 설치
PROJECT_PATH=$(node -p "require('$PROJECT_CONFIG').path")
PROJECT_COMMAND=$(node -p "require('$PROJECT_CONFIG').command || ''")
if [[ -z "$PROJECT_COMMAND" ]]; then
  echo "[ERROR] command is missing in $PROJECT_CONFIG" >&2
  exit 1
fi

if ! (cd "$PROJECT_PATH" && pnpm exec playwright --version >/dev/null 2>&1); then
  echo "[$(date -u +%H:%M:%S)] Playwright not available in $PROJECT_NAME, running pnpm install..."
  (cd "$PROJECT_PATH" && pnpm install)
fi

echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."

(cd "$PROJECT_PATH" && bash -c "$PROJECT_COMMAND" > "$PW_OUTPUT" 2> "${PW_OUTPUT%.json}.stderr.log") || true

node "$SCRIPT_DIR/parse-pw-results.js" "$PW_OUTPUT" "$PROJECT_NAME" "$DATE" > "$RESULTS_FILE"
echo "[$(date -u +%H:%M:%S)] Results saved: $RESULTS_FILE"
