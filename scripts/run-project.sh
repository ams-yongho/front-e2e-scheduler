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
      die "fork failed: $!" unless defined $pid;
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

# write_unit_error <out_file> <reason>
write_unit_error() {
  local out_file="$1"; local reason="$2"
  ERR_PROJECT="$PROJECT_NAME" ERR_DATE="$DATE" ERR_REASON="$reason" \
    node -e '
      const fs = require("fs");
      const r = {
        project: process.env.ERR_PROJECT,
        type: "unit",
        date: process.env.ERR_DATE,
        status: "error",
        framework: "unknown",
        total: 0, passed: 0, failed: 0, skipped: 0,
        duration: "-",
        error: process.env.ERR_REASON,
        failures: [],
        slowTests: [],
      };
      fs.writeFileSync(process.argv[1], JSON.stringify(r, null, 2));
    ' "$out_file"
}

# write_e2e_error <out_file> <reason>
# Playwright JSON 을 얻지 못했을 때(명령 자체 실패, 비JSON 출력 등) 빈 파일 대신 error 결과를 남긴다.
# 빈 파일은 대시보드/Slack 에 "결과 없음"으로만 보여 원인을 알 수 없다.
write_e2e_error() {
  local out_file="$1"; local reason="$2"
  ERR_PROJECT="$PROJECT_NAME" ERR_DATE="$DATE" ERR_REASON="$reason" \
    node -e '
      const fs = require("fs");
      const r = {
        project: process.env.ERR_PROJECT,
        type: "e2e",
        date: process.env.ERR_DATE,
        status: "error",
        total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0,
        duration: "-",
        browsers: [],
        error: process.env.ERR_REASON,
        failures: [],
        flakyTests: [],
        slowTests: [],
      };
      fs.writeFileSync(process.argv[1], JSON.stringify(r, null, 2));
    ' "$out_file"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
export SCHEDULER_REPO_ROOT="$REPO_ROOT"

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

  # 전용 포트 선점 검사.
  # 스테이징 CORS 가 특정 포트만 허용해 포트를 바꿀 수 없는 프로젝트(typist 등)는
  # reuseExistingServer 가 켜져 있으면 그 포트에 떠 있는 '남의' dev 서버를 그대로 잡아
  # 엉뚱한 앱을 테스트하고 전수 실패한다. 개발자 프로세스를 죽이지 않는 것이 이 레포의
  # 원칙이므로, 점유를 발견하면 조용히 틀린 결과를 내는 대신 사유를 남기고 건너뛴다.
  local exclusive_port
  exclusive_port=$(node -p "require('$PROJECT_CONFIG').exclusive_port || ''")
  if [[ -n "$exclusive_port" ]]; then
    local holder_pids
    holder_pids=$(lsof -nP -iTCP:"$exclusive_port" -sTCP:LISTEN -t 2>/dev/null | sort -u | tr '\n' ',' | sed 's/,$//')
    if [[ -n "$holder_pids" ]]; then
      # next-server 같은 자식 프로세스는 이름만으로 어느 레포 것인지 알 수 없다.
      # 어떤 체크아웃의 dev 서버인지 바로 알아보도록 부모 명령줄까지 함께 남긴다.
      local holder_desc holder_ppids
      holder_desc=$(ps -o pid=,command= -p "$holder_pids" 2>/dev/null | sed 's/^[[:space:]]*//' | head -n 3 | paste -sd '; ' -)
      holder_ppids=$(ps -o ppid= -p "$holder_pids" 2>/dev/null | tr -d ' ' | sort -u | grep -v '^1$' | tr '\n' ',' | sed 's/,$//')
      if [[ -n "$holder_ppids" ]]; then
        holder_desc="${holder_desc} / 부모: $(ps -o pid=,command= -p "$holder_ppids" 2>/dev/null | sed 's/^[[:space:]]*//' | cut -c1-200 | head -n 3 | paste -sd '; ' -)"
      fi
      echo "[WARN] $PROJECT_NAME: 포트 $exclusive_port 점유 중 → E2E 건너뜀 ($holder_desc)"
      write_e2e_error "$out_file" "포트 ${exclusive_port} 를 다른 프로세스가 점유하고 있어 E2E 를 건너뜀 (${holder_desc}). 이 프로젝트는 스테이징 CORS 제약으로 포트를 바꿀 수 없어, 남의 서버를 재사용하면 엉뚱한 앱을 테스트하게 된다. 해당 프로세스를 종료한 뒤 다시 실행할 것."
      return 0
    fi
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

  local e2e_timeout_secs e2e_shards
  e2e_timeout_secs=$(node -p "require('$PROJECT_CONFIG').e2e_timeout_seconds || 1800")
  # e2e_shards: Playwright --shard 로 스펙을 N등분해 순차 실행한다.
  # 타임아웃이 샤드마다 따로 걸리므로, 스펙이 많아 한 번에 제한시간을 넘기던 프로젝트도
  # 전부 버려지지 않고 샤드 단위로 결과가 남는다. --shard 를 받지 않는 커스텀 러너에는 쓰지 말 것.
  e2e_shards=$(node -p "require('$PROJECT_CONFIG').e2e_shards || 1")

  local stderr_log="${tmp%.json}.stderr.log"
  local e2e_timed_out=0
  : > "$stderr_log"

  if (( e2e_shards > 1 )); then
    local -a shard_files=()
    local shard_idx shard_tmp shard_stderr shard_rc
    for (( shard_idx = 1; shard_idx <= e2e_shards; shard_idx++ )); do
      shard_tmp="${tmp%.json}.shard${shard_idx}.json"
      shard_stderr="${shard_tmp%.json}.stderr.log"
      shard_files+=("$shard_tmp")
      echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E shard ${shard_idx}/${e2e_shards} (timeout ${e2e_timeout_secs}s)..."
      shard_rc=0
      (cd "$PROJECT_PATH" && run_with_timeout "$e2e_timeout_secs" \
        bash -c "$E2E_COMMAND --shard=${shard_idx}/${e2e_shards}" > "$shard_tmp" 2> "$shard_stderr") || shard_rc=$?
      if [[ "$shard_rc" -eq 124 ]]; then
        e2e_timed_out=1
        echo "[WARN] $PROJECT_NAME E2E shard ${shard_idx}/${e2e_shards} 타임아웃 (${e2e_timeout_secs}s)."
        echo "[run-project] shard ${shard_idx}/${e2e_shards} 타임아웃 (>${e2e_timeout_secs}초)" >> "$shard_stderr"
      fi
      cat "$shard_stderr" >> "$stderr_log" 2>/dev/null || true
    done
    # 병합 실패(= 모든 샤드가 JSON 미생성)면 빈 파일로 두어 아래 파서 실패 경로를 타게 한다.
    node "$SCRIPT_DIR/merge-pw-shards.js" "$tmp" "${shard_files[@]}" 2>>"$stderr_log" || : > "$tmp"
  else
    local e2e_rc=0
    echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests (timeout ${e2e_timeout_secs}s)..."
    (cd "$PROJECT_PATH" && run_with_timeout "$e2e_timeout_secs" bash -c "$E2E_COMMAND" > "$tmp" 2> "$stderr_log") || e2e_rc=$?
    if [[ "$e2e_rc" -eq 124 ]]; then
      e2e_timed_out=1
      echo "[WARN] $PROJECT_NAME E2E 타임아웃 (${e2e_timeout_secs}s)."
    fi
  fi

  local -a parse_args=("$tmp" "$PROJECT_NAME" "$DATE")
  if [[ -d "$attachments_src" ]]; then
    rm -rf "$attachments_out"
    mkdir -p "$attachments_out"
    cp -R "$attachments_src"/. "$attachments_out"/ 2>/dev/null || true
    parse_args+=("$attachments_src" "$attachments_url")
  fi

  if node "$SCRIPT_DIR/parse-pw-results.js" "${parse_args[@]}" > "$out_file" 2>>"$stderr_log"; then
    echo "[$(date -u +%H:%M:%S)] E2E results saved: $out_file"
  else
    # 파서가 실패하면 > 리다이렉트로 빈 파일만 남는다. 명령 출력 첫 줄을 사유에 담아 error 결과로 대체한다.
    local first_line
    first_line=$(head -c 300 "$tmp" 2>/dev/null | head -n 1 | tr -d '\r')
    local reason
    # 타임아웃으로 죽은 경우 "JSON 생성 실패"만 적으면 파싱 문제로 오인하게 된다. 사유를 먼저 밝힌다.
    if [[ "$e2e_timed_out" -eq 1 ]]; then
      reason="E2E 실행 타임아웃 (>${e2e_timeout_secs}초) 으로 Playwright JSON 결과를 얻지 못함"
    else
      reason="E2E 명령이 Playwright JSON 결과를 생성하지 못함"
    fi
    if [[ -n "$first_line" ]]; then
      reason="$reason. 출력: ${first_line}"
    fi
    reason="$reason. stderr 로그: $stderr_log"
    echo "[WARN] $PROJECT_NAME e2e produced no parseable JSON; writing error result."
    write_e2e_error "$out_file" "$reason"
  fi
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
  local stderr_log="${tmp%.json}.stderr.log"
  local UNIT_RC=0
  (cd "$PROJECT_PATH" && run_with_timeout "$timeout_secs" bash -c "$UNIT_COMMAND" > "$tmp" 2> "$stderr_log") || UNIT_RC=$?
  if [[ "$UNIT_RC" -eq 124 ]]; then
    echo "[WARN] $PROJECT_NAME unit timed out (${timeout_secs}s); writing error result."
    write_unit_error "$out_file" "유닛 실행 타임아웃 (>${timeout_secs}초). stderr 로그: $stderr_log"
    return 0
  fi

  if node "$SCRIPT_DIR/parse-unit-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$UNIT_COMMAND" > "$out_file" 2>>"$stderr_log"; then
    echo "[$(date -u +%H:%M:%S)] Unit results saved: $out_file"
  else
    echo "[WARN] $PROJECT_NAME unit produced no parseable JSON; writing error result."
    write_unit_error "$out_file" "유닛 명령이 JSON 결과를 생성하지 못함. stderr 로그: $stderr_log"
  fi
}

case "$ONLY" in
  e2e) run_e2e ;;
  unit) run_unit ;;
  '')   run_e2e; run_unit ;;
  *) echo "[ERROR] Unknown --only value: $ONLY (expected e2e or unit)" >&2; exit 2 ;;
esac
