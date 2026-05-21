#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

CRON_SCHEDULE="${CRON_SCHEDULE:-0 12 * * 1-5}"  # 기본값: 주중 12:00 KST
CRON_TZ="TZ=Asia/Seoul"
CRON_CMD="$CRON_SCHEDULE /bin/bash $SCRIPT_DIR/run-all.sh >> $REPO_ROOT/logs/cron.log 2>&1"

CURRENT="$(crontab -l 2>/dev/null || true)"

# 기존 항목(우리 run-all.sh, PATH, TZ)을 제거하여 멱등 재등록을 보장한다.
FILTERED=$(printf "%s\n" "$CURRENT" \
  | grep -vF "$SCRIPT_DIR/run-all.sh" \
  | grep -v '^PATH=' \
  | grep -vxF "$TZ_LINE" \
  | sed '/^$/d' || true)

{
  if [[ -n "$FILTERED" ]]; then printf "%s\n" "$FILTERED"; fi
  echo "$TZ_LINE"
  echo "$PATH_LINE"
  echo "$CRON_CMD"
} | crontab -

echo "Cron job registered:"
crontab -l
