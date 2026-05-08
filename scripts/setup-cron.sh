#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

CRON_SCHEDULE="${CRON_SCHEDULE:-0 10 * * *}"  # 기본값: 매일 오전 10시 KST
CRON_TZ="TZ=Asia/Seoul"
CRON_CMD="$CRON_SCHEDULE /bin/bash $SCRIPT_DIR/run-all.sh >> $REPO_ROOT/logs/cron.log 2>&1"

if crontab -l 2>/dev/null | grep -qF "$SCRIPT_DIR/run-all.sh"; then
  echo "Already registered. No changes made."
  exit 0
fi

CURRENT=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT" | grep -qF "$CRON_TZ"; then
  (echo "$CURRENT"; echo "$CRON_CMD") | crontab -
else
  (echo "$CURRENT"; echo "$CRON_TZ"; echo "$CRON_CMD") | crontab -
fi

echo "Cron job registered: $CRON_CMD"
