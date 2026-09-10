#!/bin/bash
# run-all.sh 가 프로젝트 순회가 끝난 뒤(또는 중단 시) 호출한다.
# sync-all-repos.sh 가 남긴 결과 파일을 읽어 result=synced 인 레포만 원래 브랜치로 되돌리고,
# 복귀 결과(restore 필드)를 같은 파일에 덧붙인다. 결과 파일이 없으면 아무 일도 하지 않는다.
#
#   restore-all-repos.sh <sync_out_file>
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_OUT_FILE="${1:-}"

if [[ -z "$SYNC_OUT_FILE" ]]; then
  echo "Usage: restore-all-repos.sh <sync_out_file>" >&2
  exit 2
fi

[[ -f "$SYNC_OUT_FILE" ]] || exit 0

restore_tmp="$(mktemp)"
trap 'rm -f "$restore_tmp"' EXIT

# synced 레포만 "root<TAB>ref" (원래 브랜치, detached 였으면 커밋)
while IFS=$'\t' read -r root ref; do
  [[ -n "$root" ]] || continue
  line="$(bash "$SCRIPT_DIR/sync-repo.sh" restore "$root" "$ref")"
  result="$(REPO_LINE="$line" node -p 'JSON.parse(process.env.REPO_LINE).result')"
  echo "[$(date -u +%H:%M:%S)] [restore-all] $root → $ref: $result"
  printf '%s\t%s\n' "$root" "$result" >> "$restore_tmp"
done < <(SYNC_FILE="$SYNC_OUT_FILE" node -e '
  const fs = require("fs");
  for (const r of JSON.parse(fs.readFileSync(process.env.SYNC_FILE, "utf8"))) {
    if (r.result !== "synced") continue;
    const ref = r.original_branch || r.original_head;
    if (!ref) continue;
    process.stdout.write([r.root, ref].join("\t") + "\n");
  }
')

RESTORE_TMP="$restore_tmp" node -e '
  const fs = require("fs");
  const file = process.argv[1];
  const results = JSON.parse(fs.readFileSync(file, "utf8"));
  const restored = new Map(
    fs.readFileSync(process.env.RESTORE_TMP, "utf8").split("\n").filter(Boolean)
      .map(l => l.split("\t"))
  );
  for (const r of results) {
    if (restored.has(r.root)) r.restore = restored.get(r.root);
  }
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
' "$SYNC_OUT_FILE"
