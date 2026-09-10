#!/bin/bash
# 실행 직전에 대상 레포를 지정 브랜치의 origin 최신으로 맞추고, 끝나면 원래 브랜치로 되돌린다.
#
#   sync-repo.sh sync    <repo_root> <branch>   # 동기화. 결과를 JSON 한 줄로 stdout 에 출력
#   sync-repo.sh restore <repo_root> <ref>      # 원래 브랜치(또는 커밋)로 복귀
#
# 개발자 작업 트리를 훼손하지 않는 것이 최우선이다.
#   - 미커밋 변경(추적 파일)이 있으면 건드리지 않고 skipped_dirty
#   - 로컬 브랜치에 origin 에 없는 커밋이 있으면 덮어쓰지 않고 skipped_local_ahead
#   - 그 외 git 실패는 failed
# 종료 코드는 인자 오류를 제외하면 항상 0 이며, 결과는 JSON 의 result 필드로 전달한다.
#   result: synced | skipped_dirty | skipped_local_ahead | failed | restored
set -uo pipefail

SYNC_SKIP_INSTALL="${SYNC_SKIP_INSTALL:-0}"

usage() {
  echo "Usage: sync-repo.sh sync <repo_root> <branch> | restore <repo_root> <ref>" >&2
  exit 2
}

# emit <result> <message> [extra JSON fields...]
emit() {
  local result="$1"; local message="$2"; shift 2
  SR_ROOT="$ROOT" SR_BRANCH="${BRANCH:-}" SR_RESULT="$result" SR_MESSAGE="$message" \
  SR_ORIGINAL_BRANCH="${ORIGINAL_BRANCH:-}" SR_ORIGINAL_HEAD="${ORIGINAL_HEAD:-}" \
  SR_HEAD="${HEAD_SHORT:-}" SR_INSTALLED="${INSTALLED:-false}" \
    node -e '
      const e = process.env;
      console.log(JSON.stringify({
        root: e.SR_ROOT,
        branch: e.SR_BRANCH,
        original_branch: e.SR_ORIGINAL_BRANCH,
        original_head: e.SR_ORIGINAL_HEAD,
        result: e.SR_RESULT,
        head: e.SR_HEAD,
        installed: e.SR_INSTALLED === "true",
        message: e.SR_MESSAGE,
      }));
    '
}

git_in() { git -C "$ROOT" "$@"; }

# node_modules 가 현재 pnpm-lock.yaml 과 일치하는지. pnpm 은 설치 시점의 lockfile 사본을
# node_modules/.pnpm/lock.yaml 에 남기므로 둘을 비교하면 재설치 필요 여부를 정확히 알 수 있다.
needs_install() {
  [[ -f "$ROOT/pnpm-lock.yaml" ]] || return 1
  [[ -f "$ROOT/node_modules/.pnpm/lock.yaml" ]] || return 0
  ! cmp -s "$ROOT/pnpm-lock.yaml" "$ROOT/node_modules/.pnpm/lock.yaml"
}

do_sync() {
  if ! git_in rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    emit failed "git 저장소가 아님: $ROOT"; return 0
  fi

  ORIGINAL_BRANCH="$(git_in symbolic-ref --short -q HEAD || true)"
  ORIGINAL_HEAD="$(git_in rev-parse HEAD 2>/dev/null || true)"

  # 추적 파일의 미커밋 변경만 검사한다. 미추적 파일은 checkout 이 필요할 때 git 이 스스로 막는다.
  if [[ -n "$(git_in status --porcelain --untracked-files=no)" ]]; then
    emit skipped_dirty "미커밋 변경이 있어 브랜치를 바꾸지 않음 (현재 브랜치: ${ORIGINAL_BRANCH:-detached})"; return 0
  fi

  local fetch_err
  if ! fetch_err="$(git_in fetch -q origin "$BRANCH" 2>&1)"; then
    emit failed "git fetch origin $BRANCH 실패: ${fetch_err}"; return 0
  fi

  if git_in show-ref --verify -q "refs/heads/$BRANCH"; then
    if ! git_in merge-base --is-ancestor "$BRANCH" "origin/$BRANCH"; then
      emit skipped_local_ahead "로컬 $BRANCH 에 origin 에 없는 커밋이 있어 덮어쓰지 않음"; return 0
    fi
  fi

  local checkout_err
  if git_in show-ref --verify -q "refs/heads/$BRANCH"; then
    checkout_err="$(git_in checkout -q "$BRANCH" 2>&1 && git_in merge -q --ff-only "origin/$BRANCH" 2>&1)" \
      || { emit failed "git checkout/merge $BRANCH 실패: ${checkout_err}"; return 0; }
  else
    checkout_err="$(git_in checkout -q -b "$BRANCH" --track "origin/$BRANCH" 2>&1)" \
      || { emit failed "git checkout -b $BRANCH 실패: ${checkout_err}"; return 0; }
  fi

  INSTALLED=false
  if [[ "$SYNC_SKIP_INSTALL" != "1" ]] && needs_install; then
    echo "[sync-repo] node_modules 가 pnpm-lock.yaml 과 불일치 → pnpm install --frozen-lockfile ($ROOT)" >&2
    if (cd "$ROOT" && pnpm install --frozen-lockfile >&2); then
      INSTALLED=true
    else
      echo "[sync-repo] WARN: pnpm install 실패 ($ROOT). 기존 node_modules 로 계속 진행" >&2
    fi
  fi

  HEAD_SHORT="$(git_in rev-parse --short HEAD)"
  emit synced "origin/$BRANCH 최신으로 동기화 (원래 브랜치: ${ORIGINAL_BRANCH:-detached@${ORIGINAL_HEAD:0:7}})"
}

do_restore() {
  local ref="$1"
  if [[ -z "$ref" ]]; then
    emit failed "복귀 대상 ref 가 비어 있음"; return 0
  fi
  local err
  if err="$(git_in checkout -q "$ref" 2>&1)"; then
    HEAD_SHORT="$(git_in rev-parse --short HEAD)"
    emit restored "원래 ref 로 복귀: $ref"
  else
    emit failed "복귀 실패 ($ref): ${err}"
  fi
}

MODE="${1:-}"; ROOT="${2:-}"
case "$MODE" in
  sync)
    BRANCH="${3:-}"
    [[ -n "$ROOT" && -n "$BRANCH" ]] || usage
    do_sync
    ;;
  restore)
    [[ -n "$ROOT" ]] || usage
    do_restore "${3:-}"
    ;;
  *) usage ;;
esac
