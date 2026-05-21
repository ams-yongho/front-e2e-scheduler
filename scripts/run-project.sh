#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_NAME=""
ONLY=""

while (($#)); do
  case "$1" in
    --only)
      shift
      ONLY="${1:-}"
      ;;
    -*)
      echo "[ERROR] Unknown option: $1" >&2
      exit 2
      ;;
    *)
      if [[ -z "$PROJECT_NAME" ]]; then
        PROJECT_NAME="$1"
      else
        echo "[ERROR] Unexpected positional arg: $1" >&2
        exit 2
      fi
      ;;
  esac
  shift
done

if [[ -z "$PROJECT_NAME" ]]; then
  echo "Usage: run-project.sh <project> [--only e2e|unit]" >&2
  exit 2
fi

PROJECT_DIR="$REPO_ROOT/projects/$PROJECT_NAME"
PROJECT_CONFIG="$PROJECT_DIR/config.json"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] Project not found: $PROJECT_NAME" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
RESULTS_DIR="$REPO_ROOT/results/$PROJECT_NAME"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

PROJECT_PATH=$(node -p "require('$PROJECT_CONFIG').path")
E2E_COMMAND=$(node -p "require('$PROJECT_CONFIG').e2e_command || ''")
UNIT_COMMAND=$(node -p "require('$PROJECT_CONFIG').unit_command || ''")

run_e2e() {
  if [[ -z "$E2E_COMMAND" ]]; then
    echo "[run-project] $PROJECT_NAME: no e2e_command, skipping E2E."
    return 0
  fi
  local out_dir="$RESULTS_DIR/e2e"
  local out_file="$out_dir/$DATE.json"
  local tmp="/tmp/pw-${PROJECT_NAME}-${DATE}.json"
  local attachments_src="$PROJECT_PATH/test-results"
  local attachments_root="$out_dir/attachments"
  local attachments_out="$attachments_root/$DATE"
  local attachments_url="/results/$PROJECT_NAME/e2e/attachments/$DATE"
  mkdir -p "$out_dir"

  # 14일 보존: 오늘 기준 14일 이전 날짜 디렉토리 정리
  local cutoff
  cutoff=$(node -e "console.log(new Date(Date.now()-14*86400000).toISOString().slice(0,10))")
  if [[ -d "$attachments_root" ]]; then
    for d in "$attachments_root"/*/; do
      [[ -d "$d" ]] || continue
      local name
      name=$(basename "$d")
      if [[ "$name" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "$name" < "$cutoff" ]]; then
        rm -rf "$d"
      fi
    done
  fi

  if ! (cd "$PROJECT_PATH" && pnpm exec playwright --version >/dev/null 2>&1); then
    echo "[$(date -u +%H:%M:%S)] Playwright not available in $PROJECT_NAME, running pnpm install..."
    (cd "$PROJECT_PATH" && pnpm install)
  fi

  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."
  (cd "$PROJECT_PATH" && bash -c "$E2E_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true

  if [[ -d "$attachments_src" ]]; then
    rm -rf "$attachments_out"
    mkdir -p "$attachments_out"
    cp -R "$attachments_src"/. "$attachments_out"/ 2>/dev/null || true
    node "$SCRIPT_DIR/parse-pw-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$attachments_src" "$attachments_url" > "$out_file"
  else
    node "$SCRIPT_DIR/parse-pw-results.js" "$tmp" "$PROJECT_NAME" "$DATE" > "$out_file"
  fi
  echo "[$(date -u +%H:%M:%S)] E2E results saved: $out_file"
}

run_unit() {
  if [[ -z "$UNIT_COMMAND" ]]; then
    echo "[run-project] $PROJECT_NAME: no unit_command, skipping unit."
    return 0
  fi
  local out_dir="$RESULTS_DIR/unit"
  local out_file="$out_dir/$DATE.json"
  local tmp="/tmp/unit-${PROJECT_NAME}-${DATE}.json"
  mkdir -p "$out_dir"

  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME unit tests..."
  (cd "$PROJECT_PATH" && bash -c "$UNIT_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
  node "$SCRIPT_DIR/parse-unit-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$UNIT_COMMAND" > "$out_file" || {
    echo "[WARN] $PROJECT_NAME unit parse failed; removing partial output."
    rm -f "$out_file"
  }
  if [[ -f "$out_file" ]]; then
    echo "[$(date -u +%H:%M:%S)] Unit results saved: $out_file"
  fi
}

case "$ONLY" in
  e2e) run_e2e ;;
  unit) run_unit ;;
  '')   run_e2e; run_unit ;;
  *) echo "[ERROR] Unknown --only value: $ONLY (expected e2e or unit)" >&2; exit 2 ;;
esac
