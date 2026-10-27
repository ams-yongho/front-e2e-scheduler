#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECTS_DIR="$REPO_ROOT/projects"
RESULTS_DIR="$REPO_ROOT/results"
MANIFEST_FILE="$RESULTS_DIR/manifest.json"
DATE="$(date +%Y-%m-%d)"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all started"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

# 1) 기존 results 레이아웃 자동 마이그레이션 (idempotent)
bash "$SCRIPT_DIR/migrate-results-layout.sh" "$RESULTS_DIR"

# 2) 프로젝트 존재 여부 확인
if ! ls "$PROJECTS_DIR"/*/config.json > /dev/null 2>&1; then
  echo "[ERROR] No projects found in $PROJECTS_DIR" >&2
  exit 1
fi

# 2.5) 레포 동기화: config.json 에 repo:{root,branch} 가 있는 레포를 origin/<branch> 최신으로 맞춘다.
#      개발자 체크아웃을 공유하므로 미커밋 변경·로컬 커밋이 있으면 건드리지 않고 현재 상태로 실행한다.
#      끝나면(중단돼도) restore-all-repos.sh 가 원래 브랜치로 되돌린다. SKIP_REPO_SYNC=1 로 끌 수 있다.
SYNC_FILE="$RESULTS_DIR/sync/$DATE.json"
if [[ "${SKIP_REPO_SYNC:-0}" == "1" ]]; then
  echo "[run-all] SKIP_REPO_SYNC=1 → 레포 동기화 건너뜀"
else
  bash "$SCRIPT_DIR/sync-all-repos.sh" "$PROJECTS_DIR" "$SYNC_FILE" \
    || echo "[WARN] repo sync step failed, continuing with current checkouts..."
  trap 'bash "$SCRIPT_DIR/restore-all-repos.sh" "$SYNC_FILE" || echo "[WARN] repo restore failed"' EXIT
fi

# 3) 프로젝트별 실행 (실패해도 다음으로 진행)
#    항상 한 번에 한 프로젝트씩 순차 실행한다 — 동시 실행하지 않는다.
#    로컬 포트를 고정해 쓰는 프로젝트(config 의 exclusive_port)끼리 겹치지 않도록
#    실행 순서를 config.json 의 order(기본 100) 오름차순 → 이름 순으로 명시적으로 고정한다.
#    디렉토리 이름 알파벳 순에 기대면 프로젝트가 추가될 때 순서가 조용히 바뀐다.
ORDERED_PROJECTS=$(node -e "
const fs = require('fs');
const path = require('path');
const dir = '$PROJECTS_DIR';
const list = fs.readdirSync(dir)
  .filter(d => fs.existsSync(path.join(dir, d, 'config.json')))
  .map(d => require(path.join(dir, d, 'config.json')))
  .map(c => ({ name: c.name, order: typeof c.order === 'number' ? c.order : 100 }))
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
console.log(list.map(p => p.name).join('\n'));
")

while IFS= read -r project; do
  [[ -n "$project" ]] || continue
  echo "--- Running: $project ---"
  bash "$SCRIPT_DIR/run-project.sh" "$project" \
    || echo "[WARN] $project finished with errors, continuing..."
done <<< "$ORDERED_PROJECTS"

# 4) manifest.json 생성 (projects + tests 맵 + lastUpdated)
node -e "
const path = require('path');
const fs = require('fs');
const dir = '$PROJECTS_DIR';
const projects = fs.readdirSync(dir)
  .filter(d => fs.existsSync(path.join(dir, d, 'config.json')))
  .map(d => require(path.join(dir, d, 'config.json')));
const names = projects.map(p => p.name);
const tests = {};
for (const p of projects) {
  const types = [];
  if (typeof p.e2e_command === 'string' && p.e2e_command.length > 0) types.push('e2e');
  if (typeof p.unit_command === 'string' && p.unit_command.length > 0) types.push('unit');
  tests[p.name] = types;
}
fs.mkdirSync(path.dirname('$MANIFEST_FILE'), { recursive: true });
fs.writeFileSync('$MANIFEST_FILE', JSON.stringify({ projects: names, tests, lastUpdated: new Date().toISOString() }, null, 2));
console.log('Manifest updated:', names);
"

# 5) Slack 통합 요약 발송
node "$SCRIPT_DIR/slack-notify.js" --summary "$DATE" "$PROJECTS_DIR" "$RESULTS_DIR"
echo "[$(date -u +%H:%M:%S)] Slack summary notification sent"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all complete"
