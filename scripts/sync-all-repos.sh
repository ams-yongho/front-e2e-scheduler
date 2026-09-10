#!/bin/bash
# run-all.sh 가 프로젝트 순회 전에 호출한다.
# projects_dir 의 repo 설정을 레포 단위로 모아 sync-repo.sh sync 를 실행하고,
# 레포별 결과 배열을 <sync_out_file> 에 JSON 으로 저장한다 (restore-all-repos.sh 가 읽는다).
#
#   sync-all-repos.sh <projects_dir> <sync_out_file>
#
# 개별 레포의 동기화 실패는 결과 파일에 기록만 하고 계속 진행한다. 종료 코드는 인자 오류 외에는 0.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="${1:-}"
SYNC_OUT_FILE="${2:-}"

if [[ -z "$PROJECTS_DIR" || -z "$SYNC_OUT_FILE" ]]; then
  echo "Usage: sync-all-repos.sh <projects_dir> <sync_out_file>" >&2
  exit 2
fi

mkdir -p "$(dirname "$SYNC_OUT_FILE")"

repos_json="$(node "$SCRIPT_DIR/collect-repos.js" "$PROJECTS_DIR")" || {
  echo "[sync-all] repo 설정 수집 실패. 동기화를 건너뜁니다." >&2
  echo "[]" > "$SYNC_OUT_FILE"
  exit 0
}

results_tmp="$(mktemp)"
trap 'rm -f "$results_tmp"' EXIT

# 레포별로 "root<TAB>branch<TAB>projects(콤마)" 한 줄씩
while IFS=$'\t' read -r root branch projects; do
  [[ -n "$root" ]] || continue
  echo "[$(date -u +%H:%M:%S)] [sync-all] $root → $branch (projects: $projects)"
  line="$(bash "$SCRIPT_DIR/sync-repo.sh" sync "$root" "$branch")"
  result="$(REPO_LINE="$line" node -p 'JSON.parse(process.env.REPO_LINE).result')"
  message="$(REPO_LINE="$line" node -p 'JSON.parse(process.env.REPO_LINE).message')"
  echo "[$(date -u +%H:%M:%S)] [sync-all] $root: $result — $message"
  REPO_LINE="$line" REPO_PROJECTS="$projects" node -p '
    JSON.stringify({ ...JSON.parse(process.env.REPO_LINE), projects: process.env.REPO_PROJECTS.split(",") })
  ' >> "$results_tmp"
done < <(REPOS_JSON="$repos_json" node -e '
  for (const r of JSON.parse(process.env.REPOS_JSON)) {
    process.stdout.write([r.root, r.branch, r.projects.join(",")].join("\t") + "\n");
  }
')

RESULTS_TMP="$results_tmp" node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.env.RESULTS_TMP, "utf8").split("\n").filter(Boolean);
  fs.writeFileSync(process.argv[1], JSON.stringify(lines.map(l => JSON.parse(l)), null, 2));
' "$SYNC_OUT_FILE"

echo "[$(date -u +%H:%M:%S)] [sync-all] 결과 저장: $SYNC_OUT_FILE"
