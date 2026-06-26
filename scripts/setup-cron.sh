#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

CRON_SCHEDULE="${CRON_SCHEDULE:-0 6 * * 1-5}"  # 기본값: 주중 06:00 KST
TZ_LINE="TZ=Asia/Seoul"

# cron 기본 PATH는 /usr/bin:/bin이라 nvm/homebrew의 node, pnpm을 찾지 못한다.
# 현재 shell에서 node 절대경로를 감지해서 PATH에 prepend한다.
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "[ERROR] node not found in PATH. Install node, then re-run." >&2
  exit 1
fi
NODE_BIN_DIR="$(dirname "$NODE_BIN")"
PATH_LINE="PATH=${NODE_BIN_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

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
