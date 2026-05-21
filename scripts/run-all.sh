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

# 3) 프로젝트별 실행 (실패해도 다음으로 진행)
for config in "$PROJECTS_DIR"/*/config.json; do
  [[ -f "$config" ]] || continue
  project=$(node -p "require('$config').name")
  echo "--- Running: $project ---"
  bash "$SCRIPT_DIR/run-project.sh" "$project" \
    || echo "[WARN] $project finished with errors, continuing..."
done

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
