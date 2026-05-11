#!/bin/bash
set -euo pipefail

# Usage: run.sh <output_json_file>
# partsfit-mall Playwright 테스트를 staging 대상으로 실행, 결과를 $1에 저장
OUTPUT_FILE="$1"
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH=$(node -p "require('${CONFIG_DIR}/config.json').path")

cd "$PROJECT_PATH"
# 테스트 실패 시에도 JSON 출력은 생성되므로 || true 사용
PLAYWRIGHT_TARGET=staging pnpm playwright test --reporter=json > "$OUTPUT_FILE" 2> "${OUTPUT_FILE%.json}.stderr.log" || true
