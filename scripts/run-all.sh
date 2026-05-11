#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECTS_DIR="$REPO_ROOT/projects"
MANIFEST_FILE="$REPO_ROOT/results/manifest.json"
DATE="$(date +%Y-%m-%d)"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all started"

# 프로젝트 존재 여부 확인
if ! ls "$PROJECTS_DIR"/*/config.json > /dev/null 2>&1; then
  echo "[ERROR] No projects found in $PROJECTS_DIR" >&2
  exit 1
fi

# 각 프로젝트 실행 (실패해도 계속 진행)
for config in "$PROJECTS_DIR"/*/config.json; do
  [[ -f "$config" ]] || continue
  project=$(node -p "require('$config').name")
  echo "--- Running: $project ---"
  bash "$SCRIPT_DIR/run-project.sh" "$project" \
    || echo "[WARN] $project finished with errors, continuing..."
done

# manifest.json 업데이트 (Node.js로 파일 시스템 기반 생성)
node -e "
const path = require('path');
const fs = require('fs');
const dir = '$PROJECTS_DIR';
const projects = fs.readdirSync(dir)
  .filter(d => fs.existsSync(path.join(dir, d, 'config.json')))
  .map(d => require(path.join(dir, d, 'config.json')).name);
fs.mkdirSync(path.dirname('$MANIFEST_FILE'), { recursive: true });
fs.writeFileSync('$MANIFEST_FILE', JSON.stringify({ projects, lastUpdated: new Date().toISOString() }, null, 2));
console.log('Manifest updated:', projects);
"

# .env 로드 (있는 경우)
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

node "$SCRIPT_DIR/slack-notify.js" --summary "$DATE" "$PROJECTS_DIR" "$REPO_ROOT/results"
echo "[$(date -u +%H:%M:%S)] Slack summary notification sent"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all complete"
