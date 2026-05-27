# biz-mall 유닛테스트 결과 복구 + 스케줄러 실패 가시화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** biz-mall 의 유닛테스트가 대시보드/Slack에 정상 결과로 나오도록 복구하고, 앞으로 같은 "조용한 결과 없음"이 발생하면 즉시 실패로 드러나도록 스케줄러를 강화한다.

**Architecture:** 두 개의 독립적으로 배포 가능한 Phase 로 구성한다. **Phase 1(스케줄러 레포)** 은 유닛 명령을 타임아웃으로 감싸고, JSON을 못 만들면 `status:'error'` 결과 파일을 기록하며, 그 상태를 대시보드/Slack에 실패로 표시한다. **Phase 2(biz-mall-front 레포)** 는 Storybook 브라우저 프로젝트를 제외한 CI 전용 vitest 설정을 추가하고, 테스트 종료(open-handle) 행을 잡은 뒤, 스케줄러 `unit_command` 를 그 설정으로 교체해 실제 결과가 생성되는지 검증한다. Phase 1을 먼저 적용하면 Phase 2 가 끝나기 전이라도 biz-mall 이 "수집 실패"로 명시되고 야간 전체 실행을 막지 않는다.

**Tech Stack:** Bash(run-project.sh), Node.js(파서/Slack, 별도 러너 없이 `node <file>.test.js` 로 테스트), Vite + React + TypeScript + Vitest(대시보드), Vitest 3.2(biz-mall-front, pnpm 워크스페이스).

---

## 근본 원인 (조사·재현 완료)

스케줄러에 등록된 biz-mall 유닛 명령은 `pnpm vitest run --reporter=json` 이다. biz-mall 의 `vitest.config.ts` 는 **멀티 프로젝트** 구성으로, 두 번째 프로젝트가 `@storybook/addon-vitest` + 실제 Playwright 크로미움 브라우저(`browser.enabled: true`)다.

1. **Storybook 프로젝트가 셋업에서 막힘** — 위 명령은 storybook 프로젝트까지 셋업하다 `No story files found` / 브라우저 기동에서 행·에러가 나 JSON을 전혀 만들지 못한다. `--project=0`, `--project='!storybook'` 같은 CLI 필터로도 **셋업 단계는 건너뛰지 못함**(재현 확인). biz-admin 은 단일 프로젝트라 정상.
2. **유닛 스위트 자체의 비종료/메모리** — storybook 을 제외하고 유닛만(152개 파일) 돌리면 테스트는 모두 통과하지만, 기본 ~4GB 힙에서 OOM 이 나거나, 힙을 키워도 **모든 파일이 끝난 뒤 vitest 가 종료(onFinished)되지 않고 행**한다(열린 타이머/핸들 추정). `--reporter=json` 은 종료 시점에만 출력되므로 JSON이 안 나온다. 소규모(파일 2~3개) 실행은 `EXIT=0` 으로 깨끗이 끝나고 유효한 JSON을 낸다(확인).
3. **결과 처리** — JSON이 없으면 `parse-unit-results.js` 가 빈 출력으로 `exit 2` → `run-project.sh` 가 결과 파일을 삭제 → 대시보드 "결과 없음". 게다가 `run-project.sh` 의 유닛 명령에는 **타임아웃이 없어** 행이 나면 야간 전체 실행이 무한정 멈춘다. Slack 요약도 "등록됐는데 결과 없음" 을 실패로 집계하지 않아 **조용히** 묻힌다.

---

# Phase 1 — 스케줄러 강화 (silent failure 방지)

작업 디렉토리: `front-e2e-scheduler` 레포 루트. 스케줄러 테스트는 별도 러너 없이 `node scripts/__tests__/<name>.test.js` 로 직접 실행한다.

### Task 1: 유닛·E2E 명령을 이식성 있는 타임아웃으로 감싸기

행이 나도 야간 전체 실행이 멈추지 않도록 `run-project.sh` 에 타임아웃 래퍼를 추가한다. macOS 에는 GNU `timeout` 이 없을 수 있으므로 `timeout`/`gtimeout`/`perl` 폴백을 모두 지원한다.

**Files:**
- Modify: `scripts/run-project.sh`
- Test: `scripts/__tests__/run-project.test.js` (기존 테스트가 계속 통과해야 함 — 회귀 가드)

- [ ] **Step 1: 타임아웃 헬퍼 함수 추가**

`scripts/run-project.sh` 에서 `set -euo pipefail` 바로 다음(상단 변수 파싱 이전, 6번째 줄 부근)에 함수를 추가한다.

```bash
# Portable timeout: run_with_timeout <seconds> <command...>
# timeout(GNU) / gtimeout(coreutils) / perl 폴백 순으로 사용. 타임아웃 시 exit code 124.
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  else
    perl -e '
      my $s = shift @ARGV;
      my $pid = fork();
      if ($pid == 0) { exec @ARGV or exit 127; }
      local $SIG{ALRM} = sub { kill "TERM", $pid; exit 124; };
      alarm $s;
      waitpid($pid, 0);
      exit($? >> 8);
    ' "$secs" "$@"
  fi
}
```

- [ ] **Step 2: 유닛 명령 실행부를 타임아웃으로 감싸기**

`run_unit()` 안의 실행 라인을 교체한다. 기존:

```bash
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME unit tests..."
  (cd "$PROJECT_PATH" && bash -c "$UNIT_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
```

교체 후:

```bash
  local timeout_secs
  timeout_secs=$(node -p "require('$PROJECT_CONFIG').unit_timeout_seconds || 600")
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME unit tests (timeout ${timeout_secs}s)..."
  UNIT_RC=0
  (cd "$PROJECT_PATH" && run_with_timeout "$timeout_secs" bash -c "$UNIT_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || UNIT_RC=$?
```

(`UNIT_RC` 는 Task 2 에서 사용한다. `set -e` 환경에서 `|| UNIT_RC=$?` 로 비정상 종료를 흡수한다.)

- [ ] **Step 3: E2E 명령 실행부도 타임아웃으로 감싸기**

`run_e2e()` 안의 실행 라인을 교체한다. 기존:

```bash
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."
  (cd "$PROJECT_PATH" && bash -c "$E2E_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
```

교체 후:

```bash
  local e2e_timeout_secs
  e2e_timeout_secs=$(node -p "require('$PROJECT_CONFIG').e2e_timeout_seconds || 1800")
  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests (timeout ${e2e_timeout_secs}s)..."
  (cd "$PROJECT_PATH" && run_with_timeout "$e2e_timeout_secs" bash -c "$E2E_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
```

- [ ] **Step 4: 기존 테스트가 통과하는지 확인 (회귀 가드)**

Run: `node scripts/__tests__/run-project.test.js`
Expected: 출력에 `✅ run-project uses config.e2e_command`, `✅ run-project unit_command pipeline`, `✅ run-project attachments collection + 14-day retention` 가 모두 찍히고 종료코드 0. (빠른 emitter 명령은 타임아웃 한참 안에 끝나므로 동작 동일.)

- [ ] **Step 5: 커밋**

```bash
git add scripts/run-project.sh
git commit -m "feat(scheduler): wrap unit/e2e commands with portable timeout"
```

---

### Task 2: JSON 미생성 시 error-status 결과 파일 기록

기존엔 파싱 실패 시 결과 파일을 삭제해 "결과 없음" 으로 사라졌다. 대신 `status:'error'` + 사유를 담은 결과 파일을 남겨 대시보드/Slack 이 실패로 인지하게 한다.

**Files:**
- Modify: `scripts/run-project.sh` (`run_unit()`)
- Test: `scripts/__tests__/run-project.test.js` (error 케이스 추가)

- [ ] **Step 1: 실패 케이스 테스트 먼저 작성 (RED)**

`scripts/__tests__/run-project.test.js` 의 마지막 `} finally {` (최상위 cleanup, 257번째 줄 부근) **직전**에 다음 시나리오 블록을 추가한다. 빈 JSON을 내는 유닛 명령 → error 결과 파일이 남아야 한다.

```javascript
  // --- Unit 실패(빈 출력) → error 결과 파일 시나리오 ---
  const errProjectName = '__tmp-unit-error-test';
  const errProjectDir = path.join(repoRoot, 'projects', errProjectName);
  const errResultDir = path.join(repoRoot, 'results', errProjectName);
  const errResultFile = path.join(errResultDir, 'unit', `${today}.json`);

  fs.rmSync(errProjectDir, { recursive: true, force: true });
  fs.rmSync(errResultDir, { recursive: true, force: true });
  fs.mkdirSync(errProjectDir, { recursive: true });

  fs.writeFileSync(
    path.join(errProjectDir, 'config.json'),
    JSON.stringify({
      name: errProjectName,
      path: fixtureProjectDir,
      e2e_command: '',
      // stdout 에 아무것도 안 내고 종료 → 빈 출력 → 파서 exit 2
      unit_command: `${process.execPath} -e "process.exit(1)"`,
      slack_channel: '#qa-alerts',
    }, null, 2),
    'utf8'
  );

  const errRun = spawnSync('bash', ['scripts/run-project.sh', errProjectName], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });

  try {
    assert.strictEqual(errRun.status, 0, `error run should still exit 0 (run-all 계속 진행):\n${errRun.stderr}`);
    assert.ok(fs.existsSync(errResultFile), `error 결과 파일이 있어야 함: ${errResultFile}`);
    const errResult = JSON.parse(fs.readFileSync(errResultFile, 'utf8'));
    assert.strictEqual(errResult.type, 'unit');
    assert.strictEqual(errResult.status, 'error');
    assert.ok(typeof errResult.error === 'string' && errResult.error.length > 0, 'error 사유 문자열이 있어야 함');
    assert.deepStrictEqual(errResult.failures, []);
    console.log('✅ run-project unit error → error-status result file');
  } finally {
    fs.rmSync(errProjectDir, { recursive: true, force: true });
    fs.rmSync(errResultDir, { recursive: true, force: true });
  }
```

- [ ] **Step 2: 테스트가 실패하는지 확인 (RED 확인)**

Run: `node scripts/__tests__/run-project.test.js`
Expected: FAIL — 현재는 파싱 실패 시 `rm -f "$out_file"` 로 파일을 지우므로 `error 결과 파일이 있어야 함` 단언에서 실패.

- [ ] **Step 3: error 결과 기록 헬퍼 추가 (run-project.sh)**

`scripts/run-project.sh` 의 `run_with_timeout` 함수 정의 바로 아래에 헬퍼를 추가한다.

```bash
# write_unit_error <out_file> <reason>
write_unit_error() {
  local out_file="$1"; local reason="$2"
  ERR_PROJECT="$PROJECT_NAME" ERR_DATE="$DATE" ERR_REASON="$reason" \
    node -e '
      const fs = require("fs");
      const r = {
        project: process.env.ERR_PROJECT,
        type: "unit",
        date: process.env.ERR_DATE,
        status: "error",
        framework: "unknown",
        total: 0, passed: 0, failed: 0, skipped: 0,
        duration: "-",
        error: process.env.ERR_REASON,
        failures: [],
        slowTests: [],
      };
      fs.writeFileSync(process.argv[1], JSON.stringify(r, null, 2));
    ' "$out_file"
}
```

- [ ] **Step 4: `run_unit()` 의 파싱/타임아웃 분기 교체 (GREEN)**

Task 1 Step 2 적용 후 `run_unit()` 의 파싱 블록은 다음과 같다. 기존(파싱 + 실패 시 rm):

```bash
  node "$SCRIPT_DIR/parse-unit-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$UNIT_COMMAND" > "$out_file" || {
    echo "[WARN] $PROJECT_NAME unit parse failed; removing partial output."
    rm -f "$out_file"
  }
  if [[ -f "$out_file" ]]; then
    echo "[$(date -u +%H:%M:%S)] Unit results saved: $out_file"
  fi
```

교체 후(타임아웃 우선 처리 + 실패 시 error 결과 기록):

```bash
  local stderr_log="${tmp%.json}.stderr.log"
  if [[ "$UNIT_RC" -eq 124 ]]; then
    echo "[WARN] $PROJECT_NAME unit timed out (${timeout_secs}s); writing error result."
    write_unit_error "$out_file" "유닛 실행 타임아웃 (>${timeout_secs}초). stderr 로그: $stderr_log"
    return 0
  fi

  if node "$SCRIPT_DIR/parse-unit-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$UNIT_COMMAND" > "$out_file" 2>>"$stderr_log"; then
    echo "[$(date -u +%H:%M:%S)] Unit results saved: $out_file"
  else
    echo "[WARN] $PROJECT_NAME unit produced no parseable JSON; writing error result."
    write_unit_error "$out_file" "유닛 명령이 JSON 결과를 생성하지 못함. stderr 로그: $stderr_log"
  fi
```

(주의: `parse-unit-results.js` 가 `exit 2` 로 실패하면 `> "$out_file"` 가 0바이트 파일을 만들지만, 곧바로 `write_unit_error` 가 같은 경로를 덮어쓴다.)

- [ ] **Step 5: 테스트 통과 확인 (GREEN)**

Run: `node scripts/__tests__/run-project.test.js`
Expected: PASS — 기존 3개 ✅ + `✅ run-project unit error → error-status result file`.

- [ ] **Step 6: 파서 단위 테스트도 여전히 통과하는지 확인**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: PASS (이 Task 는 파서 자체를 바꾸지 않으므로 `CLI must exit 2 on empty input` 포함 전부 통과).

- [ ] **Step 7: 커밋**

```bash
git add scripts/run-project.sh scripts/__tests__/run-project.test.js
git commit -m "feat(scheduler): write error-status unit result instead of deleting on failure/timeout"
```

---

### Task 3: 대시보드에 'error' 유닛 상태 렌더링

`status:'error'` 결과를 대시보드 Unit 탭에서 빨간 "수집 실패" 상태 + 사유로 보여준다.

**Files:**
- Modify: `dashboard/src/types.ts`
- Modify: `dashboard/src/components/UnitDetail.tsx`
- Test: `dashboard/src/components/__tests__/UnitDetail.test.tsx`

- [ ] **Step 1: 타입 확장 (types.ts)**

`dashboard/src/types.ts` 의 `UnitTestResult` 를 수정한다. 기존:

```typescript
export interface UnitTestResult {
  project: string;
  type: 'unit';
  date: string;
  status: 'passed' | 'failed';
  framework: 'vitest' | 'jest' | 'unknown';
```

교체 후:

```typescript
export interface UnitTestResult {
  project: string;
  type: 'unit';
  date: string;
  status: 'passed' | 'failed' | 'error';
  error?: string;
  framework: 'vitest' | 'jest' | 'unknown';
```

- [ ] **Step 2: error 렌더링 테스트 먼저 작성 (RED)**

`dashboard/src/components/__tests__/UnitDetail.test.tsx` 에 케이스를 추가한다. (파일 상단의 import/렌더 헬퍼는 기존 테스트와 동일한 패턴을 따른다 — 기존 파일의 `render(<UnitDetail .../>)` 사용 형태를 그대로 재사용한다.)

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UnitDetail } from '../UnitDetail';
import type { UnitTestResult } from '../../types';

describe('UnitDetail error 상태', () => {
  it('status가 error면 수집 실패 배지와 사유를 보여준다', () => {
    const errored: UnitTestResult = {
      project: 'biz-mall',
      type: 'unit',
      date: '2026-05-27',
      status: 'error',
      error: '유닛 실행 타임아웃 (>600초).',
      framework: 'unknown',
      total: 0, passed: 0, failed: 0, skipped: 0,
      duration: '-',
      failures: [],
      slowTests: [],
    };
    render(<UnitDetail latest={errored} history={[]} />);
    expect(screen.getByText('수집 실패')).toBeInTheDocument();
    expect(screen.getByText(/타임아웃/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인 (RED 확인)**

Run: `cd dashboard && pnpm vitest run src/components/__tests__/UnitDetail.test.tsx`
Expected: FAIL — 현재 `UnitDetail` 은 `status:'error'` 를 `failed`(`latest.failed > 0` 가 0이므로 `passed`)로 취급해 "수집 실패" 텍스트가 없다.

- [ ] **Step 4: UnitDetail 에 error 분기 추가 (GREEN)**

`dashboard/src/components/UnitDetail.tsx` 의 `if (!latest) { ... }` 블록(20~26번째 줄) **바로 다음**에 error 분기를 추가한다.

```tsx
  if (latest.status === 'error') {
    return (
      <article
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderLeft: '2px solid var(--danger)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px 4px' }}>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            · {latest.date}
          </div>
          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 999, background: 'var(--danger-muted)', color: 'var(--danger)' }}>
            수집 실패
          </span>
        </div>
        <div style={{ padding: '8px 22px 18px', color: 'var(--text-secondary)', fontSize: 13 }}>
          유닛테스트 결과를 수집하지 못했습니다.
          {latest.error && (
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {latest.error}
            </pre>
          )}
        </div>
      </article>
    );
  }
```

- [ ] **Step 5: 테스트 통과 + 전체 대시보드 테스트 확인 (GREEN)**

Run: `cd dashboard && pnpm test`
Expected: PASS — 새 케이스 포함 전체 통과. (`pnpm test` = `vitest run --passWithNoTests`.)

- [ ] **Step 6: 타입체크/빌드 확인**

Run: `cd dashboard && pnpm build`
Expected: `tsc -b` 통과 + vite 빌드 성공 (status 유니온 확장이 다른 곳을 깨지 않음).

- [ ] **Step 7: 커밋**

```bash
git add dashboard/src/types.ts dashboard/src/components/UnitDetail.tsx dashboard/src/components/__tests__/UnitDetail.test.tsx
git commit -m "feat(dashboard): render unit 'error' (수집 실패) state with reason"
```

---

### Task 4: Slack 요약에서 미수집/error 를 실패로 집계·표시

등록된 유닛인데 결과가 없거나 `status:'error'` 인 프로젝트를 ❌ 로 표시하고, 프로젝트별 줄에 "수집 실패" 로 보여준다.

**Files:**
- Modify: `scripts/slack-notify.js` (`buildIntegratedProjectFields`, `buildSummaryMessage`)
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: 실패 집계 테스트 먼저 작성 (RED)**

`scripts/__tests__/slack-notify.test.js` 에 다음 블록을 파일 끝(마지막 `console.log` 이전 또는 이후, 최상위 스코프)에 추가한다. (이 파일은 `buildSummaryMessage` 를 직접 호출하는 패턴을 이미 사용한다 — 기존 호출부의 인자 형태를 참고해 맞춘다.)

```javascript
// --- 등록된 unit 인데 error/미수집이면 ❌ 로 집계 ---
{
  const { buildSummaryMessage } = require('../slack-notify');
  const projects = ['biz-mall'];
  const testsByProject = { 'biz-mall': ['unit'] };
  const e2eByProject = new Map();

  // (a) error 상태 결과
  const unitErr = new Map([['biz-mall', { project: 'biz-mall', type: 'unit', status: 'error', error: 'timeout', total: 0, passed: 0, failed: 0, duration: '-' }]]);
  const msgErr = buildSummaryMessage({
    date: '2026-05-27', projects, e2eByProject, unitByProject: unitErr,
    testsByProject, dashboardUrl: 'https://dash.example.com',
  });
  const flatErr = JSON.stringify(msgErr.blocks);
  assert.ok(/일부 실패/.test(flatErr), 'error 결과는 전체 상태를 실패로 만들어야 함');
  assert.ok(/수집 실패/.test(flatErr), '프로젝트 줄에 수집 실패 표시가 있어야 함');

  // (b) 결과 자체가 없는 경우(미수집)도 실패로 집계
  const unitMissing = new Map();
  const msgMissing = buildSummaryMessage({
    date: '2026-05-27', projects, e2eByProject, unitByProject: unitMissing,
    testsByProject, dashboardUrl: 'https://dash.example.com',
  });
  assert.ok(/일부 실패/.test(JSON.stringify(msgMissing.blocks)), '미수집 unit 도 실패로 집계해야 함');

  console.log('✅ slack summary: unit error/missing counts as failure');
}
```

- [ ] **Step 2: 테스트 실패 확인 (RED 확인)**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: FAIL — 현재 `anyUnitFail` 은 `r && r.status === 'failed'` 라 error/미수집을 실패로 보지 않고, 프로젝트 줄엔 "수집 실패" 텍스트가 없다.

- [ ] **Step 3: `buildIntegratedProjectFields` 의 unit 표시/실패 판정 수정**

`scripts/slack-notify.js` 의 `unitText` 와 `overallFail` 을 수정한다. 기존:

```javascript
    const unitText = (() => {
      if (!registered.includes('unit')) return '-';
      if (!unit) return '결과 없음';
      return `${unit.passed}/${unit.total}`;
    })();
```

교체 후:

```javascript
    const unitText = (() => {
      if (!registered.includes('unit')) return '-';
      if (!unit) return '결과 없음';
      if (unit.status === 'error') return '수집 실패';
      return `${unit.passed}/${unit.total}`;
    })();
```

그리고 기존:

```javascript
    const overallFail =
      (registered.includes('e2e') && (!e2e || e2e.status === 'failed')) ||
      (registered.includes('unit') && unit && unit.status === 'failed');
```

교체 후 (등록된 unit 인데 결과가 없거나 passed 가 아니면 실패):

```javascript
    const overallFail =
      (registered.includes('e2e') && (!e2e || e2e.status === 'failed')) ||
      (registered.includes('unit') && (!unit || unit.status !== 'passed'));
```

- [ ] **Step 4: `buildSummaryMessage` 의 `anyUnitFail` 판정 수정**

기존:

```javascript
  const anyUnitFail = unitEligible.some(p => {
    const r = unitByProject.get(p);
    return r && r.status === 'failed';
  });
```

교체 후:

```javascript
  const anyUnitFail = unitEligible.some(p => {
    const r = unitByProject.get(p);
    return !r || r.status !== 'passed';
  });
```

- [ ] **Step 5: 테스트 통과 확인 (GREEN)**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: PASS — 기존 케이스 + `✅ slack summary: unit error/missing counts as failure`.

> 주의: 기존 slack-notify 테스트 중 "등록된 unit 인데 결과 없음" 을 통과로 가정하던 케이스가 있으면 이 변경으로 RED 가 된다. 그 경우 해당 케이스의 기대값을 "실패로 집계" 로 함께 수정한다(이번 가시화의 의도된 동작 변경).

- [ ] **Step 6: 커밋**

```bash
git add scripts/slack-notify.js scripts/__tests__/slack-notify.test.js
git commit -m "feat(scheduler): treat missing/errored unit results as failure in Slack summary"
```

- [ ] **Step 7: Phase 1 전체 스케줄러 테스트 스위트 확인**

Run: `for t in scripts/__tests__/*.test.js; do echo "== $t =="; node "$t" || exit 1; done`
Expected: 모든 테스트 파일이 ✅ 로 통과하고 종료코드 0.

---

# Phase 2 — biz-mall 유닛 결과 복구 (biz-mall-front 레포)

작업 디렉토리: `/Users/yonghokim/Documents/GitHub/amass/biz-mall-front`. 이 레포는 스케줄러와 **별도 git 레포**이므로 커밋도 그 레포에서 한다. biz-mall 앱 경로: `apps/biz-mall`.

> **선행 확인:** `git -C /Users/yonghokim/Documents/GitHub/amass/biz-mall-front status` 에 무관한 작업 중 변경(예: 진행 중인 머지 충돌)이 있을 수 있다. 본 Phase 의 커밋에는 **이 Phase 가 만든 파일만** 스테이징한다(`git add <특정 파일>`). `git add -A` 금지.

### Task 5: Storybook 제외 CI 전용 vitest 설정 추가

**Files:**
- Create: `apps/biz-mall/vitest.ci.config.ts`
- Modify: `apps/biz-mall/package.json` (scripts 에 `test:ci` 추가)

- [ ] **Step 1: CI 전용 설정 파일 생성**

`apps/biz-mall/vitest.ci.config.ts` 를 생성한다. base 설정(`@repo/vitest-config/base` = jsdom + react + tsconfigPaths + stories 제외)에 biz-mall 의 alias 와 setup 만 더하고, **`projects` 배열(=storybook 브라우저 프로젝트)을 포함하지 않는다.**

```typescript
import path from 'path';

import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '@repo/vitest-config/base';

// CI/스케줄러 전용: Storybook 브라우저 프로젝트를 제외하고 유닛 테스트만 실행한다.
// (vitest.config.ts 의 projects[] 에 있는 storybook 프로젝트는 셋업 단계에서
//  Playwright 브라우저를 띄워 행/에러가 나므로 --reporter=json 출력이 불가능하다.)
export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@app': path.resolve(__dirname, './src/app'),
        '@/public': path.resolve(__dirname, './public'),
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      setupFiles: ['./vitest.setup.ts'],
      environmentOptions: {
        jsdom: { url: 'http://localhost:3000' },
      },
    },
  }),
);
```

- [ ] **Step 2: 설정이 storybook 없이 로드되고 소규모 실행이 깨끗이 끝나는지 확인**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front/apps/biz-mall && \
pnpm vitest run --config vitest.ci.config.ts --reporter=json \
  src/app/_lib/__test__/format.test.ts src/app/_components/__test__/Button.test.tsx
```
Expected: 종료코드 0, stdout 에 `"numTotalTests"` 가 포함된 단일 JSON. stderr 에 `No story files found` / `react-docgen` storybook 로그가 **없음**. (스토리북 제외 검증.)

- [ ] **Step 3: package.json 에 `test:ci` 스크립트 추가**

`apps/biz-mall/package.json` 의 `scripts` 에 한 줄 추가한다(기존 `"test": "vitest run"` 아래).

```json
    "test:ci": "vitest run --config vitest.ci.config.ts",
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front
git add apps/biz-mall/vitest.ci.config.ts apps/biz-mall/package.json
git commit -m "test(biz-mall): add storybook-free CI vitest config + test:ci script"
```

---

### Task 6: 유닛 스위트 비종료(open-handle) 원인 이분탐색 및 수정

소규모 실행은 `EXIT=0` 으로 끝나지만 전체 152개 실행은 모든 파일 통과 후에도 vitest 가 종료되지 않는다(열린 타이머/핸들이 이벤트 루프를 잡고 있어 `onFinished` 가 발화하지 않음). `--reporter=json` 은 종료 시점에만 출력되므로 JSON이 안 나온다. 이 Task 의 done 조건: **전체 CI 실행이 타임아웃 안에 `EXIT=0` 으로 끝나고 stdout 에 완전한 JSON 을 낸다.**

**Files:**
- Modify: 행을 유발하는 특정 테스트 파일(들) — 이분탐색으로 식별. 예상 후보: provider/타이머 사용 테스트(`apps/biz-mall/src/app/_components/provider/__test__/*.test.tsx`, TanStack Query / NextAuth / 토스트·자동닫힘 타이머 사용 컴포넌트 테스트).

- [ ] **Step 1: 전체 실행이 "모든 파일 통과 후 종료 안 됨" 인지 재확인**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front/apps/biz-mall && \
NODE_OPTIONS="--max-old-space-size=8192" timeout 240 \
  pnpm vitest run --config vitest.ci.config.ts --reporter=default --no-color \
  --testTimeout=8000 --hookTimeout=8000 2>&1 | tail -5; echo "EXIT=${PIPESTATUS[0]}"
```
Expected: 거의 모든 `✓ ...test...` 줄이 찍히지만 `Test Files N passed` 요약 줄이 **없이** `EXIT=124`(타임아웃). → 종료 단계 행 확인.

- [ ] **Step 2: 디렉토리 단위 이분탐색으로 행 유발 그룹 좁히기**

각 상위 테스트 디렉토리를 개별 실행해 어느 그룹이 `EXIT=124` 인지 찾는다(끝나는 그룹은 `EXIT=0`).

```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front/apps/biz-mall
for d in \
  'src/app/_components/**' \
  'src/app/_lib/**' \
  'src/app/(main)/**' \
  'src/app/(legal)/**' \
  'src/app/_stores/**' ; do
  echo "== $d =="
  NODE_OPTIONS="--max-old-space-size=8192" timeout 120 \
    pnpm vitest run --config vitest.ci.config.ts --reporter=dot --testTimeout=8000 "$d" >/dev/null 2>&1
  echo "EXIT=$?"
done
```
Expected: 끝나는 그룹은 `EXIT=0`, 행 그룹은 `EXIT=124`. 124 가 나온 글롭을 더 좁혀(하위 디렉토리/개별 파일) 최소 행 파일 집합을 특정한다. (행 파일이 두 개 이상일 수 있으니, 124 그룹이 사라질 때까지 파일을 하나씩 제외/포함하며 반복.)

- [ ] **Step 3: 식별된 파일에서 열린 핸들 원인 확인**

좁혀진 파일만 `--reporter=hanging-process` 로 실행하면(소규모라 종료가 임박해 핸들 리포트가 출력됨) 무엇이 이벤트 루프를 잡는지 보인다.

```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front/apps/biz-mall && \
timeout 90 pnpm vitest run --config vitest.ci.config.ts --reporter=hanging-process \
  <식별된_파일_경로> 2>&1 | tail -40; echo "EXIT=$?"
```
Expected: `Timeout`/`Immediate`/`TCPSOCKETWRAP` 등 열린 핸들의 스택이 출력 → 어느 코드(예: `setInterval`, 미정리 `QueryClient`, 미언마운트 컴포넌트의 타이머)가 원인인지 식별.

- [ ] **Step 4: 원인별 표준 수정 적용 (가장 흔한 두 패턴 중 해당하는 것)**

(a) **컴포넌트/라이브러리 타이머가 남는 경우** — 해당 테스트 파일에 가짜 타이머 + 정리를 추가한다.

```typescript
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});
```

(b) **TanStack Query 의 백그라운드 타이머/리트라이가 남는 경우** — 테스트에서 만드는 `QueryClient` 를 리트라이·gcTime 없이 만들고, 각 테스트 후 정리한다.

```typescript
import { QueryClient } from '@tanstack/react-query';
import { afterEach } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
});

afterEach(() => {
  queryClient.clear();
});
```

> 식별된 파일이 여러 개면 각 파일에 동일 패턴을 적용한다. 라이브러리 차원의 공통 원인(예: 모든 provider 테스트가 동일한 `QueryClient` 헬퍼를 쓰는 경우)이면 그 **공용 테스트 헬퍼/렌더 유틸**을 고치는 편이 DRY 하다. 공용 헬퍼 경로는 식별된 파일들의 import 에서 찾는다.

- [ ] **Step 5: 전체 실행이 종료되고 JSON 을 내는지 확인 (done 조건)**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front/apps/biz-mall && \
NODE_OPTIONS="--max-old-space-size=8192" timeout 540 \
  pnpm vitest run --config vitest.ci.config.ts --reporter=json > /tmp/bm-unit-final.json 2>/tmp/bm-unit-final.err; \
echo "EXIT=$?"; grep -o '"numTotalTests":[0-9]*\|"numFailedTests":[0-9]*' /tmp/bm-unit-final.json | head
```
Expected: `EXIT=0` (124 아님), stdout 파일에 `"numTotalTests"`(150+) 가 포함된 완전한 JSON. OOM(`out of memory`) 없음.

- [ ] **Step 6: 스케줄러 파서로 파싱되는지 확인**

Run:
```bash
node /Users/yonghokim/Documents/GitHub/amass/front-e2e-scheduler/scripts/parse-unit-results.js \
  /tmp/bm-unit-final.json biz-mall 2026-05-27 "pnpm vitest run --config vitest.ci.config.ts --reporter=json" | head -20
```
Expected: `"type": "unit"`, `"framework": "vitest"`, `"status": "passed"`(또는 실제 실패가 있으면 `failed`), `"total"` 이 150+ 인 정상 결과 JSON 출력.

- [ ] **Step 7: 커밋 (biz-mall-front)**

```bash
cd /Users/yonghokim/Documents/GitHub/amass/biz-mall-front
git add <Step 4 에서 수정한 파일들>
git commit -m "test(biz-mall): fix unit suite not terminating (close leaked timers/handles)"
```

---

### Task 7: 스케줄러 unit_command 를 CI 설정으로 교체하고 실제 결과 생성 검증

**Files:**
- Modify: `projects/biz-mall/config.json` (front-e2e-scheduler 레포)

- [ ] **Step 1: unit_command 교체**

`projects/biz-mall/config.json` 의 `unit_command` 를 CI 설정 + 힙 상향으로 바꾼다. 기존:

```json
  "unit_command": "pnpm vitest run --reporter=json"
```

교체 후:

```json
  "unit_command": "NODE_OPTIONS=--max-old-space-size=8192 pnpm vitest run --config vitest.ci.config.ts --reporter=json"
```

(`run-project.sh` 는 `bash -c "$UNIT_COMMAND"` 로 실행하므로 인라인 `NODE_OPTIONS=...` 가 그대로 적용된다. 타임아웃은 Phase 1 의 기본 600초가 적용된다. 필요하면 같은 config 에 `"unit_timeout_seconds": 900` 을 추가해 늘릴 수 있다.)

- [ ] **Step 2: 스케줄러 경유로 biz-mall 유닛만 실행 (엔드투엔드 검증)**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/front-e2e-scheduler && \
bash scripts/run-project.sh biz-mall --only unit; echo "EXIT=$?"
```
Expected: `EXIT=0`, 로그에 `Unit results saved: .../results/biz-mall/unit/<오늘>.json`. **`error result` 나 `timed out` 로그가 아님.**

- [ ] **Step 3: 생성된 결과 파일이 정상 통과 결과인지 확인**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/front-e2e-scheduler && \
node -e "const r=require('./results/biz-mall/unit/'+new Date().toISOString().slice(0,10)+'.json'); console.log(r.type, r.status, r.framework, r.total, r.passed, r.failed)"
```
Expected: `unit passed vitest <150+> <150+> 0` (또는 실제 실패가 있으면 `failed` 와 0보다 큰 failed 수 — 핵심은 `status` 가 `error` 가 **아니고** `total` 이 150+ 인 실제 결과).

- [ ] **Step 4: 커밋 (front-e2e-scheduler)**

```bash
cd /Users/yonghokim/Documents/GitHub/amass/front-e2e-scheduler
git add projects/biz-mall/config.json
git commit -m "fix(biz-mall): run unit tests via storybook-free CI vitest config"
```

---

## Self-Review

**Spec coverage (사용자 요구: "biz-mall 유닛테스트 결과가 없어"):**
- 근본 원인(스토리북 셋업 행 + 종료 안 됨/OOM) → Task 5(스토리북 제외), Task 6(종료 행 수정), Task 7(명령 교체·검증) 으로 해소.
- 사용자가 승인한 "실패 가시화" → Task 1(타임아웃으로 무한 블록 방지), Task 2(error 결과 파일), Task 3(대시보드 표시), Task 4(Slack 집계) 로 커버.

**독립 배포 가능성:** Phase 1 만 적용해도 biz-mall 은 "수집 실패(타임아웃)" 로 명시되고 야간 전체 실행을 막지 않는다. Phase 2 적용 후 실제 통과 결과로 바뀐다.

**Type consistency:** `UnitTestResult.status` 유니온에 `'error'` 추가(Task 3 Step 1)와, `run-project.sh` 가 쓰는 error 결과 객체(Task 2 Step 3), 대시보드 렌더(Task 3 Step 4), Slack 판정(Task 4)이 모두 동일한 `status:'error'` + `error:string` 형태를 사용한다. `write_unit_error` 가 만드는 필드(`failures:[]`, `slowTests:[]`, `duration:'-'`)는 `UnitTestResult` 인터페이스와 일치한다.

**알려진 리스크 / 검증 필요 지점:**
- Task 6 은 본질적으로 조사(이분탐색)다. 행 파일을 특정하기까지 반복이 필요하며, 수정 패턴(가짜 타이머/QueryClient 정리)은 식별 결과에 맞춰 적용한다. 만약 종료 행을 끝내 못 잡으면 Phase 1 덕에 biz-mall 은 "수집 실패" 로 안전하게 표시되고 전체 실행은 계속된다(치명적 회귀 없음).
- `slack-notify.test.js` 의 기존 케이스 중 "등록된 unit 결과 없음 = 통과" 를 가정하는 것이 있으면 Task 4 에서 함께 기대값을 수정한다(의도된 동작 변경).
