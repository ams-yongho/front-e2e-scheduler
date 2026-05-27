#!/bin/bash
set -euo pipefail

# Portable timeout: run_with_timeout <seconds> <command...>
# timeout(GNU) / gtimeout(coreutils) / perl 폴백 순으로 사용. 타임아웃 시 exit code 124.
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  else
    perl -e '
      my $s = shift @ARGV;
      my $pid = fork();
      if ($pid == 0) { exec @ARGV or exit 127; }
      my $timed_out = 0;
      local $SIG{ALRM} = sub {
        $timed_out = 1;
        kill "TERM", $pid;
        sleep 5;
        kill(0, $pid) and kill("KILL", $pid);  # escalate if still alive
      };
      alarm $s;
      waitpid($pid, 0);
      alarm 0;
      exit($timed_out ? 124 : ($? >> 8));
    ' "$secs" "$@"
  fi
}

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

  # 브라우저 바이너리 보장: Playwright 버전이 올라가면 새 Chromium 리비전이 필요한데
  # `pnpm install`로는 다운로드되지 않아 모든 테스트가 launch 단계에서 실패한다.
  # 이미 받은 리비전은 재다운로드하지 않으므로 매 실행마다 호출해도 거의 비용이 없다.
  # (모든 프로젝트가 chromium 엔진만 사용)
  echo "[$(date -u +%H:%M:%S)] Ensuring Chromium binary for $PROJECT_NAME..."
  (cd "$PROJECT_PATH" && pnpm exec playwright install chromium) \
    || echo "[WARN] playwright install chromium failed for $PROJECT_NAME, continuing..."

  local e2e_timeout_secs
  e2e_timeout_secs=$(node -p "require('$PROJECT_CONFIG').e2e_timeout_seconds || 1800")
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests (timeout ${e2e_timeout_secs}s)..."
  (cd "$PROJECT_PATH" && run_with_timeout "$e2e_timeout_secs" bash -c "$E2E_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true

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

  local timeout_secs
  timeout_secs=$(node -p "require('$PROJECT_CONFIG').unit_timeout_seconds || 600")
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME unit tests (timeout ${timeout_secs}s)..."
  UNIT_RC=0
  (cd "$PROJECT_PATH" && run_with_timeout "$timeout_secs" bash -c "$UNIT_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || UNIT_RC=$?
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
