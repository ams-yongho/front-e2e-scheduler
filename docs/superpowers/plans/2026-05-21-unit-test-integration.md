# 유닛테스트 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 E2E 자동화 스케줄러에 Vitest/Jest 유닛테스트를 같은 파이프라인으로 통합하고, 결과를 타입별로 분리 저장한 뒤 하나의 Slack 요약과 하나의 대시보드에서 두 타입을 모두 표시한다.

**Architecture:** `projects/*/config.json`의 `command`를 `e2e_command`로 리네임하고 `unit_command`를 추가한다. `run-project.sh`가 두 타입을 sequential로 실행하고, 결과를 `results/[project]/{e2e,unit}/YYYY-MM-DD.json`에 저장한다. Vitest/Jest는 거의 동일한 JSON reporter 스키마라 단일 파서로 정규화한다. 기존 `results/[project]/YYYY-MM-DD.json` 파일은 `run-all.sh` 첫 단계에서 자동으로 `e2e/` 하위로 이동된다. Slack 요약과 대시보드는 E2E/Unit 두 타입을 모두 표시한다.

**Tech Stack:** Bash (스크립트), Node.js (파서/Slack/테스트), React + Vite + Vitest (대시보드).

**Spec Reference:** [docs/superpowers/specs/2026-05-21-unit-test-integration-design.md](../specs/2026-05-21-unit-test-integration-design.md)

---

## File Structure

### Create

- `scripts/parse-unit-results.js` — Vitest/Jest JSON 출력 → 공통 Unit 스키마 정규화
- `scripts/migrate-results-layout.sh` — 기존 `results/[project]/YYYY-MM-DD.json` → `results/[project]/e2e/YYYY-MM-DD.json` 이동 (idempotent)
- `scripts/__tests__/parse-unit-results.test.js` — 파서 유닛테스트
- `scripts/__tests__/migrate-results-layout.test.js` — 마이그레이션 스크립트 유닛테스트
- `dashboard/src/components/UnitDetail.tsx` — Unit 탭 콘텐츠 (실패 목록, 느린 테스트, framework 배지)

### Modify

- `scripts/parse-pw-results.js` — 출력에 `type: "e2e"` 필드 추가
- `scripts/__tests__/parse-pw-results.test.js` — `type` 필드 단언 추가
- `scripts/run-project.sh` — `e2e_command`/`unit_command` 모두 처리, `--only` 옵션, `results/[project]/{e2e,unit}/` 저장
- `scripts/__tests__/run-project.test.js` — 새 config 키와 저장 경로에 맞춰 픽스처 변경 + Unit 케이스 추가
- `scripts/run-all.sh` — 시작 시 `migrate-results-layout.sh` 자동 호출, manifest에 `tests` 맵 추가
- `scripts/slack-notify.js` — 두 타입 결과 읽기, 통합 요약 생성
- `scripts/__tests__/slack-notify.test.js` — 통합 요약 픽스처
- `projects/*/config.json` (12개) — `command` → `e2e_command` 리네임
- `dashboard/src/types.ts` — `Manifest.tests` 맵, `UnitTestResult` 타입
- `dashboard/src/api.ts` — 새 경로 `fetchE2eResult`, 신규 `fetchUnitResult`
- `dashboard/src/__tests__/api.test.ts` — 새 경로/타입 테스트
- `dashboard/src/App.tsx` — 두 타입 모두 로드, 종합 상태 계산
- `dashboard/src/components/ProjectTile.tsx` — E2E/Unit 두 줄 표시
- `dashboard/src/components/ProjectCard.tsx` — 탭 UI (E2E / Unit)
- `dashboard/src/__tests__/App.test.tsx` — 두 타입 로드 검증
- `docs/spec.md` — 새 config 형식, 결과 레이아웃, manifest 형식, Slack/대시보드 설명 갱신
- `README.md` — 새 config 키 안내

### Tooling Notes

- Node.js 스크립트 테스트는 `node scripts/__tests__/<name>.test.js`로 직접 실행한다 (별도 러너 없음).
- 대시보드 테스트는 `pnpm --filter ./dashboard test`로 Vitest를 통해 실행한다.
- Bash 스크립트 테스트도 `node scripts/__tests__/<name>.test.js`에서 `spawnSync`로 호출한다.

---

## Task 1: parse-pw-results.js 출력에 `type: "e2e"` 추가

**Files:**
- Modify: `scripts/parse-pw-results.js:117-138` — `parsePlaywrightJSON` 반환 객체에 `type: 'e2e'` 추가
- Modify: `scripts/__tests__/parse-pw-results.test.js` — 새 단언 추가

- [ ] **Step 1: 실패 테스트 작성**

`scripts/__tests__/parse-pw-results.test.js` 파일 마지막의 단언 그룹 (`assert.strictEqual(result.project, ...)` 같은 라인들이 있는 영역) 직후에 다음 한 줄을 추가한다.

```js
assert.strictEqual(result.type, 'e2e', 'parsed result must mark its type as e2e');
```

해당 단언을 추가할 정확한 위치를 찾으려면 파일 안에서 `result.project` 또는 `result.status` 단언이 있는 첫 번째 묶음 끝부분에 붙인다. 다른 단언 묶음에도 동일하게 추가할 필요는 없다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node scripts/__tests__/parse-pw-results.test.js`
Expected: AssertionError — `result.type` is undefined.

- [ ] **Step 3: 최소 구현**

`scripts/parse-pw-results.js`의 `parsePlaywrightJSON` 반환 객체에 `type: 'e2e'`를 첫 필드 다음에 추가한다.

```js
function parsePlaywrightJSON(raw, projectName, date) {
  const stats = raw.stats || {};
  const expected = stats.expected || 0;
  const unexpected = stats.unexpected || 0;
  const flaky = stats.flaky || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    type: 'e2e',
    date,
    status: unexpected > 0 ? 'failed' : 'passed',
    total: expected + unexpected + flaky + skipped,
    passed: expected,
    failed: unexpected,
    flaky,
    skipped,
    duration: formatDuration(stats.duration || 0),
    browsers: collectBrowsers(raw),
    failures: collectFailures(raw.suites),
    flakyTests: collectFlakyTests(raw.suites),
    slowTests: collectSlowTests(raw.suites),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node scripts/__tests__/parse-pw-results.test.js`
Expected: PASS, no AssertionError.

- [ ] **Step 5: 커밋**

```bash
git add scripts/parse-pw-results.js scripts/__tests__/parse-pw-results.test.js
git commit -m "🎨 parse-pw-results: 출력에 type 식별자 추가"
```

---

## Task 2: parse-unit-results.js + Vitest 픽스처 (첫 그린 케이스)

**Files:**
- Create: `scripts/parse-unit-results.js`
- Create: `scripts/__tests__/parse-unit-results.test.js`

- [ ] **Step 1: 실패 테스트 작성 (Vitest 통과 픽스처)**

`scripts/__tests__/parse-unit-results.test.js`를 새로 만든다.

```js
'use strict';
const assert = require('assert');
const { parseUnitResults, parseUnitOutputText } = require('../parse-unit-results');

const vitestPassedFixture = {
  numTotalTestSuites: 2,
  numPassedTestSuites: 2,
  numFailedTestSuites: 0,
  numTotalTests: 5,
  numPassedTests: 5,
  numFailedTests: 0,
  numPendingTests: 0,
  startTime: 1716257700000,
  success: true,
  testResults: [
    {
      name: '/abs/path/src/utils/price.test.ts',
      status: 'passed',
      startTime: 1716257700000,
      endTime: 1716257701200,
      assertionResults: [
        { fullName: 'formatPrice handles zero', title: 'handles zero', status: 'passed', duration: 5 },
        { fullName: 'formatPrice handles negative', title: 'handles negative', status: 'passed', duration: 3 },
      ],
    },
    {
      name: '/abs/path/src/utils/date.test.ts',
      status: 'passed',
      startTime: 1716257701200,
      endTime: 1716257702200,
      assertionResults: [
        { fullName: 'formatDate handles ISO', title: 'handles ISO', status: 'passed', duration: 1 },
        { fullName: 'formatDate handles Date object', title: 'handles Date object', status: 'passed', duration: 1 },
        { fullName: 'formatDate handles null', title: 'handles null', status: 'passed', duration: 1 },
      ],
    },
  ],
};

const result = parseUnitResults(vitestPassedFixture, 'ca-admin', '2026-05-21', { commandText: 'pnpm vitest run --reporter=json' });

assert.strictEqual(result.project, 'ca-admin');
assert.strictEqual(result.type, 'unit');
assert.strictEqual(result.date, '2026-05-21');
assert.strictEqual(result.status, 'passed');
assert.strictEqual(result.framework, 'vitest');
assert.strictEqual(result.total, 5);
assert.strictEqual(result.passed, 5);
assert.strictEqual(result.failed, 0);
assert.strictEqual(result.skipped, 0);
assert.strictEqual(result.duration, '2초');
assert.deepStrictEqual(result.failures, []);
assert.ok(Array.isArray(result.slowTests));

console.log('✅ parseUnitResults: vitest passed fixture');
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: FAIL — `Cannot find module '../parse-unit-results'`.

- [ ] **Step 3: 최소 구현**

`scripts/parse-unit-results.js`를 새로 만든다.

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');

function formatDuration(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function detectFramework({ commandText, raw }) {
  if (typeof commandText === 'string') {
    if (/\bvitest\b/i.test(commandText)) return 'vitest';
    if (/\bjest\b/i.test(commandText)) return 'jest';
  }
  if (raw && typeof raw === 'object') {
    if (raw.wasInterrupted !== undefined || raw.snapshot) return 'jest';
    if (raw.startTime && Array.isArray(raw.testResults)) return 'vitest';
  }
  return 'unknown';
}

function iterAssertionResults(raw) {
  const out = [];
  for (const suite of raw.testResults || []) {
    for (const assertion of suite.assertionResults || []) {
      out.push({ suite, assertion });
    }
  }
  return out;
}

function collectFailures(raw) {
  const failures = [];
  for (const { suite, assertion } of iterAssertionResults(raw)) {
    if (assertion.status !== 'failed') continue;
    const messages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [];
    failures.push({
      test: assertion.fullName || assertion.title || '',
      file: suite.name || '',
      line: assertion.location?.line || 0,
      error: messages.join('\n').trim(),
    });
  }
  return failures;
}

function collectSlowTests(raw, limit = 5) {
  const all = [];
  for (const { suite, assertion } of iterAssertionResults(raw)) {
    if (typeof assertion.duration !== 'number') continue;
    all.push({
      test: assertion.fullName || assertion.title || '',
      file: suite.name || '',
      durationMs: assertion.duration,
    });
  }
  return all.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

function totalDurationMs(raw) {
  if (Array.isArray(raw.testResults) && raw.testResults.length > 0) {
    return raw.testResults.reduce((sum, suite) => {
      if (typeof suite.endTime === 'number' && typeof suite.startTime === 'number') {
        return sum + Math.max(0, suite.endTime - suite.startTime);
      }
      return sum;
    }, 0);
  }
  return 0;
}

function parseUnitResults(raw, projectName, date, { commandText } = {}) {
  const total = raw.numTotalTests || 0;
  const passed = raw.numPassedTests || 0;
  const failed = raw.numFailedTests || 0;
  const skipped = raw.numPendingTests || 0;
  const framework = detectFramework({ commandText, raw });
  return {
    project: projectName,
    type: 'unit',
    date,
    status: failed > 0 ? 'failed' : 'passed',
    framework,
    total,
    passed,
    failed,
    skipped,
    duration: formatDuration(totalDurationMs(raw)),
    failures: collectFailures(raw),
    slowTests: collectSlowTests(raw),
  };
}

function parseUnitOutputText(text, projectName = 'unknown') {
  try {
    return JSON.parse(text);
  } catch (err) {
    const starts = [];
    const lineStartJson = /^[\t ]*\{/gm;
    let match;
    while ((match = lineStartJson.exec(text)) !== null) {
      starts.push(match.index + match[0].lastIndexOf('{'));
    }
    for (const jsonStart of starts) {
      const jsonEnd = text.lastIndexOf('}');
      if (jsonEnd < jsonStart) continue;
      try {
        console.error(`[parse-unit-results] Ignoring non-JSON stdout around unit JSON for ${projectName}`);
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch {
        // try next candidate
      }
    }
    throw err;
  }
}

if (require.main === module) {
  const [,, outputFile, projectName, date, commandText] = process.argv;
  const text = fs.readFileSync(outputFile, 'utf8');
  if (text.trim() === '') {
    const stderrLog = outputFile.replace(/\.json$/, '.stderr.log');
    console.error(`[parse-unit-results] Empty unit output for ${projectName} (${outputFile}). Likely cause: unit command failed before producing JSON.`);
    console.error(`[parse-unit-results] Check stderr log: ${stderrLog}`);
    process.exit(2);
  }
  const raw = parseUnitOutputText(text, projectName);
  console.log(JSON.stringify(parseUnitResults(raw, projectName, date, { commandText }), null, 2));
}

module.exports = { parseUnitResults, parseUnitOutputText, detectFramework };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: PASS, prints `✅ parseUnitResults: vitest passed fixture`.

- [ ] **Step 5: 커밋**

```bash
git add scripts/parse-unit-results.js scripts/__tests__/parse-unit-results.test.js
git commit -m "✨ parse-unit-results: Vitest JSON 공통 스키마 정규화"
```

---

## Task 3: parse-unit-results.js — Jest 픽스처 + 실패 케이스 추가

**Files:**
- Modify: `scripts/__tests__/parse-unit-results.test.js` — Jest 픽스처 + 실패 케이스 추가
- Modify: `scripts/parse-unit-results.js` — 필요 시 보강 (Jest는 동일 키 사용하므로 보통 무수정)

- [ ] **Step 1: 실패 테스트 추가**

`scripts/__tests__/parse-unit-results.test.js`의 마지막 `console.log` 직전에 다음 블록을 추가한다.

```js
// Jest 실패 픽스처
const jestFailedFixture = {
  numTotalTestSuites: 1,
  numPassedTestSuites: 0,
  numFailedTestSuites: 1,
  numTotalTests: 3,
  numPassedTests: 1,
  numFailedTests: 2,
  numPendingTests: 0,
  success: false,
  wasInterrupted: false,
  testResults: [
    {
      name: '/abs/path/src/utils/price.test.ts',
      status: 'failed',
      startTime: 1716257710000,
      endTime: 1716257711500,
      assertionResults: [
        { fullName: 'formatPrice handles zero', title: 'handles zero', status: 'passed', duration: 5 },
        {
          fullName: 'formatPrice handles negative', title: 'handles negative', status: 'failed', duration: 8,
          failureMessages: ['Expected -1000원 but got -1000'],
          location: { line: 14, column: 4 },
        },
        {
          fullName: 'formatPrice handles huge', title: 'handles huge', status: 'failed', duration: 1,
          failureMessages: ['Expected formatted but got NaN'],
          location: { line: 22, column: 4 },
        },
      ],
    },
  ],
};

const failedResult = parseUnitResults(jestFailedFixture, 'biz-admin', '2026-05-21', { commandText: 'pnpm jest --json' });
assert.strictEqual(failedResult.framework, 'jest');
assert.strictEqual(failedResult.status, 'failed');
assert.strictEqual(failedResult.total, 3);
assert.strictEqual(failedResult.passed, 1);
assert.strictEqual(failedResult.failed, 2);
assert.strictEqual(failedResult.failures.length, 2);
assert.strictEqual(failedResult.failures[0].test, 'formatPrice handles negative');
assert.strictEqual(failedResult.failures[0].file, '/abs/path/src/utils/price.test.ts');
assert.strictEqual(failedResult.failures[0].line, 14);
assert.ok(failedResult.failures[0].error.includes('Expected -1000원'));

console.log('✅ parseUnitResults: jest failed fixture');
```

- [ ] **Step 2: 테스트 실행 후 결과 확인**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: PASS — Jest 픽스처에서도 통과. 만약 실패하면 `detectFramework`/`collectFailures`가 누락한 부분을 보강한다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/__tests__/parse-unit-results.test.js
git commit -m "✅ parse-unit-results: Jest 실패 픽스처 테스트 추가"
```

---

## Task 4: parse-unit-results.js — framework 자동 감지 보조 케이스

**Files:**
- Modify: `scripts/__tests__/parse-unit-results.test.js` — `unknown` 케이스 + commandText 없을 때 raw 마커로 식별
- Modify: `scripts/parse-unit-results.js` — 필요 시 `detectFramework` 강화

- [ ] **Step 1: 실패 테스트 추가**

`scripts/__tests__/parse-unit-results.test.js` 마지막 `console.log` 앞에 다음을 추가한다.

```js
// commandText 없이 raw 마커로 식별
const vitestNoCmd = parseUnitResults(vitestPassedFixture, 'x', '2026-05-21');
assert.strictEqual(vitestNoCmd.framework, 'vitest');

const jestNoCmd = parseUnitResults(jestFailedFixture, 'x', '2026-05-21');
assert.strictEqual(jestNoCmd.framework, 'jest');

// 어느 마커도 없는 경우
const ambiguous = parseUnitResults({ numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, testResults: [] }, 'x', '2026-05-21');
assert.strictEqual(ambiguous.framework, 'unknown');

console.log('✅ parseUnitResults: framework auto-detect');
```

- [ ] **Step 2: 테스트 실행 확인**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: PASS. 만약 `vitestNoCmd.framework`가 `'unknown'`이면 `detectFramework`에서 `raw.startTime && raw.testResults.length > 0` 조건만 통과되므로 `testResults`가 비지 않은지 확인하고, jest 식별 조건(`wasInterrupted !== undefined`)이 `false` 값에서도 작동하는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/__tests__/parse-unit-results.test.js scripts/parse-unit-results.js
git commit -m "✅ parse-unit-results: framework 자동 감지 테스트 추가"
```

---

## Task 5: parse-unit-results.js — 빈 출력/혼합 stdout 방어

**Files:**
- Modify: `scripts/__tests__/parse-unit-results.test.js` — 혼합 stdout fixture + 빈 출력 CLI 케이스
- Modify: `scripts/parse-unit-results.js` (필요 시)

- [ ] **Step 1: 실패 테스트 추가**

같은 테스트 파일 마지막에 다음을 추가한다.

```js
// 혼합 stdout: 디버그 로그 + JSON
const mixed = `> pnpm vitest run --reporter=json\n` +
  `(node:1234) ExperimentalWarning: blah\n` +
  `${JSON.stringify(vitestPassedFixture)}\n`;
const parsedMixed = parseUnitOutputText(mixed, 'ca-admin');
assert.strictEqual(parsedMixed.numTotalTests, 5);

// 완전히 깨진 입력 → throw
assert.throws(() => parseUnitOutputText('not json at all', 'ca-admin'));

// CLI: 빈 파일 입력 시 exit code 2
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const emptyFile = path.join(os.tmpdir(), `unit-empty-${Date.now()}.json`);
fs.writeFileSync(emptyFile, '', 'utf8');
const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../parse-unit-results.js'), emptyFile, 'ca-admin', '2026-05-21', 'pnpm vitest'], { encoding: 'utf8' });
fs.rmSync(emptyFile, { force: true });
assert.strictEqual(cli.status, 2, `CLI must exit 2 on empty input, got ${cli.status}\nstderr: ${cli.stderr}`);
assert.ok(/Empty unit output/.test(cli.stderr));

console.log('✅ parseUnitResults: defensive empty + mixed stdout');
```

- [ ] **Step 2: 테스트 실행**

Run: `node scripts/__tests__/parse-unit-results.test.js`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add scripts/__tests__/parse-unit-results.test.js
git commit -m "✅ parse-unit-results: 빈 출력/혼합 stdout 방어 테스트"
```

---

## Task 6: migrate-results-layout.sh + 테스트

**Files:**
- Create: `scripts/migrate-results-layout.sh`
- Create: `scripts/__tests__/migrate-results-layout.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`scripts/__tests__/migrate-results-layout.test.js`를 새로 만든다.

```js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-layout-'));
const resultsDir = path.join(tmpRoot, 'results');

try {
  // Fixture 1: 기존 레이아웃 — ca-admin에 루트 날짜 JSON 2개
  fs.mkdirSync(path.join(resultsDir, 'ca-admin'), { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'ca-admin', '2026-05-19.json'), '{"date":"2026-05-19"}');
  fs.writeFileSync(path.join(resultsDir, 'ca-admin', '2026-05-20.json'), '{"date":"2026-05-20"}');

  // Fixture 2: 이미 e2e/ 하위로 이동된 프로젝트
  fs.mkdirSync(path.join(resultsDir, 'biz-admin', 'e2e'), { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'biz-admin', 'e2e', '2026-05-20.json'), '{"date":"2026-05-20"}');

  // Fixture 3: 다른 파일 (manifest.json) — 건드리지 않아야 함
  fs.writeFileSync(path.join(resultsDir, 'manifest.json'), '{"projects":[]}');

  const script = path.resolve(__dirname, '../migrate-results-layout.sh');
  const r1 = spawnSync('bash', [script, resultsDir], { encoding: 'utf8' });
  assert.strictEqual(r1.status, 0, `migrate failed:\n${r1.stderr}`);

  assert.ok(fs.existsSync(path.join(resultsDir, 'ca-admin', 'e2e', '2026-05-19.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'ca-admin', 'e2e', '2026-05-20.json')));
  assert.ok(!fs.existsSync(path.join(resultsDir, 'ca-admin', '2026-05-19.json')));
  assert.ok(!fs.existsSync(path.join(resultsDir, 'ca-admin', '2026-05-20.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'biz-admin', 'e2e', '2026-05-20.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'manifest.json')));

  // 두 번째 실행은 idempotent
  const r2 = spawnSync('bash', [script, resultsDir], { encoding: 'utf8' });
  assert.strictEqual(r2.status, 0, `second migrate failed:\n${r2.stderr}`);

  console.log('✅ migrate-results-layout: legacy → e2e/, idempotent');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node scripts/__tests__/migrate-results-layout.test.js`
Expected: FAIL — script not found.

- [ ] **Step 3: 스크립트 작성**

`scripts/migrate-results-layout.sh`를 새로 만들고 실행권한을 준다.

```bash
#!/bin/bash
set -euo pipefail

RESULTS_DIR="${1:-}"
if [[ -z "$RESULTS_DIR" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RESULTS_DIR="$(dirname "$SCRIPT_DIR")/results"
fi

if [[ ! -d "$RESULTS_DIR" ]]; then
  echo "[migrate-results-layout] No results dir at $RESULTS_DIR, nothing to do."
  exit 0
fi

shopt -s nullglob

moved=0
for project_dir in "$RESULTS_DIR"/*/; do
  project_dir="${project_dir%/}"
  [[ -d "$project_dir" ]] || continue

  e2e_dir="$project_dir/e2e"
  for file in "$project_dir"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json; do
    [[ -f "$file" ]] || continue
    mkdir -p "$e2e_dir"
    base="$(basename "$file")"
    target="$e2e_dir/$base"
    if [[ -e "$target" ]]; then
      echo "[migrate-results-layout] Skip (already exists): $target"
      rm -f "$file"
    else
      mv "$file" "$target"
      moved=$((moved + 1))
    fi
  done
done

if [[ "$moved" -gt 0 ]]; then
  echo "[migrate-results-layout] Migrated $moved result file(s) into e2e/ subdirectories."
else
  echo "[migrate-results-layout] No legacy result files to migrate."
fi
```

권한 부여: `chmod +x scripts/migrate-results-layout.sh`.

- [ ] **Step 4: 테스트 통과 확인**

Run: `chmod +x scripts/migrate-results-layout.sh && node scripts/__tests__/migrate-results-layout.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add scripts/migrate-results-layout.sh scripts/__tests__/migrate-results-layout.test.js
git commit -m "✨ migrate-results-layout: 결과 파일 e2e/ 하위로 이동 (idempotent)"
```

---

## Task 7: 12개 `projects/*/config.json` 리네임

**Files:**
- Modify: `projects/biz-admin/config.json`
- Modify: `projects/biz-mall/config.json`
- Modify: `projects/ca-admin/config.json`
- Modify: `projects/cv-view/config.json`
- Modify: `projects/find-parts/config.json`
- Modify: `projects/fp-part-quote/config.json`
- Modify: `projects/partsfit-mall/config.json`
- Modify: `projects/partsfit-mobile/config.json`
- Modify: `projects/pv-view/config.json`
- Modify: `projects/scm-front/config.json`
- Modify: `projects/typist/config.json`
- Modify: `projects/vis/config.json`

- [ ] **Step 1: 일괄 리네임**

각 파일에서 `"command":` 키를 `"e2e_command":`로 변경한다. 12개 파일 모두에 대해 동일하게 적용. 다른 필드는 손대지 않는다.

JSON 키만 바뀌고 값은 그대로 유지된다.

```bash
for f in projects/*/config.json; do
  node -e "
    const fs = require('fs');
    const f = '$f';
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.command !== undefined) {
      j.e2e_command = j.command;
      delete j.command;
    }
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n', 'utf8');
  "
done
```

- [ ] **Step 2: 변경 확인**

Run: `grep -l '"command"' projects/*/config.json | head` should produce no output, and `grep -l '"e2e_command"' projects/*/config.json | wc -l` should be `12`.

- [ ] **Step 3: 커밋**

```bash
git add projects/*/config.json
git commit -m "🚚 projects/*/config.json: command → e2e_command 리네임"
```

---

## Task 8: run-project.sh 리팩터 — 두 타입 + 신규 저장 경로

**Files:**
- Modify: `scripts/run-project.sh`
- Modify: `scripts/__tests__/run-project.test.js`

- [ ] **Step 1: 기존 테스트 픽스처 마이그레이션 (E2E 경로)**

`scripts/__tests__/run-project.test.js`에서:

1. config.json 작성 부분의 `command:` 키를 `e2e_command:`로 변경.
2. 결과 파일 경로 변수 `resultFile`을 `results/${projectName}/e2e/${today}.json`으로 변경.

해당 파일에서 다음 두 줄을 찾아 수정한다.

```js
// (이전)
command: `${process.execPath} ${configuredEmitter} --reporter=json`,
// (이후)
e2e_command: `${process.execPath} ${configuredEmitter} --reporter=json`,
```

```js
// (이전)
const resultFile = path.join(resultDir, `${today}.json`);
// (이후)
const resultFile = path.join(resultDir, 'e2e', `${today}.json`);
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node scripts/__tests__/run-project.test.js`
Expected: FAIL — `[ERROR] command is missing` (run-project.sh가 아직 옛 키를 봄) 또는 결과 파일 경로 불일치.

- [ ] **Step 3: run-project.sh 재작성**

`scripts/run-project.sh`를 다음 내용으로 교체한다.

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_NAME=""
ONLY=""

while (($#)); do
  case "$1" in
    --only)
      shift
      ONLY="${1:-}"
      ;;
    -*)
      echo "[ERROR] Unknown option: $1" >&2
      exit 2
      ;;
    *)
      if [[ -z "$PROJECT_NAME" ]]; then
        PROJECT_NAME="$1"
      else
        echo "[ERROR] Unexpected positional arg: $1" >&2
        exit 2
      fi
      ;;
  esac
  shift
done

if [[ -z "$PROJECT_NAME" ]]; then
  echo "Usage: run-project.sh <project> [--only e2e|unit]" >&2
  exit 2
fi

PROJECT_DIR="$REPO_ROOT/projects/$PROJECT_NAME"
PROJECT_CONFIG="$PROJECT_DIR/config.json"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] Project not found: $PROJECT_NAME" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
RESULTS_DIR="$REPO_ROOT/results/$PROJECT_NAME"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

PROJECT_PATH=$(node -p "require('$PROJECT_CONFIG').path")
E2E_COMMAND=$(node -p "require('$PROJECT_CONFIG').e2e_command || ''")
UNIT_COMMAND=$(node -p "require('$PROJECT_CONFIG').unit_command || ''")

run_e2e() {
  if [[ -z "$E2E_COMMAND" ]]; then
    echo "[run-project] $PROJECT_NAME: no e2e_command, skipping E2E."
    return 0
  fi
  local out_dir="$RESULTS_DIR/e2e"
  local out_file="$out_dir/$DATE.json"
  local tmp="/tmp/pw-${PROJECT_NAME}-${DATE}.json"
  mkdir -p "$out_dir"

  if ! (cd "$PROJECT_PATH" && pnpm exec playwright --version >/dev/null 2>&1); then
    echo "[$(date -u +%H:%M:%S)] Playwright not available in $PROJECT_NAME, running pnpm install..."
    (cd "$PROJECT_PATH" && pnpm install)
  fi

  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."
  (cd "$PROJECT_PATH" && bash -c "$E2E_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
  node "$SCRIPT_DIR/parse-pw-results.js" "$tmp" "$PROJECT_NAME" "$DATE" > "$out_file"
  echo "[$(date -u +%H:%M:%S)] E2E results saved: $out_file"
}

run_unit() {
  if [[ -z "$UNIT_COMMAND" ]]; then
    echo "[run-project] $PROJECT_NAME: no unit_command, skipping unit."
    return 0
  fi
  local out_dir="$RESULTS_DIR/unit"
  local out_file="$out_dir/$DATE.json"
  local tmp="/tmp/unit-${PROJECT_NAME}-${DATE}.json"
  mkdir -p "$out_dir"

  echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME unit tests..."
  (cd "$PROJECT_PATH" && bash -c "$UNIT_COMMAND" > "$tmp" 2> "${tmp%.json}.stderr.log") || true
  node "$SCRIPT_DIR/parse-unit-results.js" "$tmp" "$PROJECT_NAME" "$DATE" "$UNIT_COMMAND" > "$out_file" || {
    echo "[WARN] $PROJECT_NAME unit parse failed; removing partial output."
    rm -f "$out_file"
  }
  if [[ -f "$out_file" ]]; then
    echo "[$(date -u +%H:%M:%S)] Unit results saved: $out_file"
  fi
}

case "$ONLY" in
  e2e) run_e2e ;;
  unit) run_unit ;;
  '')   run_e2e; run_unit ;;
  *) echo "[ERROR] Unknown --only value: $ONLY (expected e2e or unit)" >&2; exit 2 ;;
esac
```

- [ ] **Step 4: E2E 테스트 통과 확인**

Run: `node scripts/__tests__/run-project.test.js`
Expected: PASS — 결과 파일이 `results/__tmp-command-test/e2e/<today>.json`에 생성됨.

- [ ] **Step 5: Unit 경로 테스트 추가**

`scripts/__tests__/run-project.test.js` 파일에서 기존 try 블록 안 마지막 `console.log('✅ ...')` 직전에 다음 블록을 추가한다 (cleanup은 finally가 처리).

```js
// --- Unit 경로 시나리오 ---
const unitProjectName = '__tmp-unit-test';
const unitProjectDir = path.join(repoRoot, 'projects', unitProjectName);
const unitResultDir = path.join(repoRoot, 'results', unitProjectName);
const unitResultFile = path.join(unitResultDir, 'unit', `${today}.json`);

fs.rmSync(unitProjectDir, { recursive: true, force: true });
fs.rmSync(unitResultDir, { recursive: true, force: true });
fs.mkdirSync(unitProjectDir, { recursive: true });

const unitEmitter = path.join(fixtureProjectDir, 'unit-emitter.js');
const unitJson = JSON.stringify({
  numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, numPendingTests: 0,
  startTime: 1716257700000,
  testResults: [{
    name: 'a.test.ts', status: 'passed', startTime: 1716257700000, endTime: 1716257701500,
    assertionResults: [
      { fullName: 'a', title: 'a', status: 'passed', duration: 1 },
      { fullName: 'b', title: 'b', status: 'passed', duration: 1 },
      { fullName: 'c', title: 'c', status: 'passed', duration: 1 },
    ],
  }],
});
fs.writeFileSync(unitEmitter, `console.log(${JSON.stringify(unitJson)});\n`, 'utf8');

fs.writeFileSync(
  path.join(unitProjectDir, 'config.json'),
  JSON.stringify({
    name: unitProjectName,
    path: fixtureProjectDir,
    e2e_command: '',
    unit_command: `${process.execPath} ${unitEmitter}`,
    slack_channel: '#qa-alerts',
  }, null, 2),
  'utf8'
);

const unitRun = spawnSync('bash', ['scripts/run-project.sh', unitProjectName], {
  cwd: repoRoot,
  env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
  encoding: 'utf8',
});

try {
  assert.strictEqual(unitRun.status, 0, `unit run failed:\nstdout:\n${unitRun.stdout}\nstderr:\n${unitRun.stderr}`);
  assert.ok(fs.existsSync(unitResultFile), `unit result missing: ${unitResultFile}`);
  const unitResult = JSON.parse(fs.readFileSync(unitResultFile, 'utf8'));
  assert.strictEqual(unitResult.type, 'unit');
  assert.strictEqual(unitResult.framework, 'vitest'); // command에 vitest가 없지만 raw 마커로 식별
  assert.strictEqual(unitResult.total, 3);
  assert.strictEqual(unitResult.passed, 3);
  console.log('✅ run-project unit_command pipeline');
} finally {
  fs.rmSync(unitProjectDir, { recursive: true, force: true });
  fs.rmSync(unitResultDir, { recursive: true, force: true });
}
```

> 주의: 위 단언에서 `framework`는 `vitest`로 추정되어야 하는데 command에 `vitest` 단어가 없다. 따라서 raw 객체의 `startTime + testResults.length > 0` 패턴으로 fallback 식별이 동작해야 한다. 픽스처에서 `startTime`을 0이 아닌 양수 값(`1716257700000`)으로 명시했으므로 fallback이 성공한다. 만약 결과가 `unknown`으로 나오면 `detectFramework`의 vitest 조건에서 `raw.startTime > 0 && Array.isArray(raw.testResults) && raw.testResults.length > 0`로 강화한다.

- [ ] **Step 6: Unit 테스트 실행**

Run: `node scripts/__tests__/run-project.test.js`
Expected: PASS — 두 시나리오 모두 성공.

- [ ] **Step 7: 커밋**

```bash
git add scripts/run-project.sh scripts/__tests__/run-project.test.js
git commit -m "♻️ run-project: e2e/unit 두 타입 + 분리 저장 경로 지원"
```

---

## Task 9: run-all.sh — 자동 마이그레이션 + manifest `tests` 맵

**Files:**
- Modify: `scripts/run-all.sh`

- [ ] **Step 1: 스크립트 수정**

`scripts/run-all.sh`를 아래 내용으로 교체한다.

```bash
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
```

- [ ] **Step 2: 빠른 sanity 확인**

Run: `bash -n scripts/run-all.sh` (문법 체크).
Expected: 종료 코드 0, 출력 없음.

- [ ] **Step 3: 커밋**

```bash
git add scripts/run-all.sh
git commit -m "♻️ run-all: 자동 마이그레이션 + manifest tests 맵"
```

---

## Task 10: slack-notify.js — 두 타입 읽기 + 통합 요약 (TDD)

**Files:**
- Modify: `scripts/__tests__/slack-notify.test.js`
- Modify: `scripts/slack-notify.js`

- [ ] **Step 1: 실패 테스트 추가 — 통합 요약 시나리오**

`scripts/__tests__/slack-notify.test.js` 상단 import에 추가:

```js
const { buildSummaryMessage, readResultsByProject } = require('../slack-notify');
```

이미 있다면 그대로. 그리고 파일 끝에 다음 새 시나리오를 추가한다.

```js
// === Unit 통합 시나리오 ===
{
  const projectsIntegrated = ['ca-admin', 'biz-admin', 'typist'];
  const e2eMap = new Map([
    ['ca-admin', { project: 'ca-admin', type: 'e2e', date: '2026-05-21', status: 'passed', total: 21, passed: 19, failed: 0, skipped: 2, duration: '41초', failures: [] }],
    ['biz-admin', { project: 'biz-admin', type: 'e2e', date: '2026-05-21', status: 'failed', total: 160, passed: 69, failed: 18, skipped: 0, duration: '1분 12초', failures: [] }],
  ]);
  const unitMap = new Map([
    ['ca-admin', { project: 'ca-admin', type: 'unit', date: '2026-05-21', status: 'passed', framework: 'vitest', total: 120, passed: 118, failed: 0, skipped: 2, duration: '12초', failures: [] }],
    ['biz-admin', { project: 'biz-admin', type: 'unit', date: '2026-05-21', status: 'passed', framework: 'vitest', total: 410, passed: 410, failed: 0, skipped: 0, duration: '18초', failures: [] }],
  ]);
  const testsByProject = { 'ca-admin': ['e2e', 'unit'], 'biz-admin': ['e2e', 'unit'], 'typist': ['e2e'] };

  const message = buildSummaryMessage({
    date: '2026-05-21',
    projects: projectsIntegrated,
    e2eByProject: e2eMap,
    unitByProject: unitMap,
    testsByProject,
    dashboardUrl: 'http://example.com:8080',
  });

  // 두 개의 Summary 섹션이 있어야 함 (E2E, Unit)
  const summaryTexts = message.blocks
    .filter(b => b.type === 'section' && Array.isArray(b.fields))
    .flatMap(b => b.fields.map(f => f.text));
  assert.ok(summaryTexts.some(t => t.includes('E2E') && t.includes('프로젝트 통과')), 'missing E2E summary');
  assert.ok(summaryTexts.some(t => t.includes('Unit') && t.includes('프로젝트 통과')), 'missing Unit summary');

  // 프로젝트 줄에 두 타입 모두 표기
  assert.ok(summaryTexts.some(t => t === 'E2E 19/21 · Unit 118/120 · 41초 + 12초'),
    `ca-admin combined row missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E')).join(' | ')}`);

  // typist는 unit 미등록 → Unit -
  assert.ok(summaryTexts.some(t => t.includes('Unit -')),
    `typist Unit - missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E') || t.includes('typist')).join(' | ')}`);

  // 종합 헤더는 'E2E 테스트' 대신 '테스트 전체 결과'
  const header = message.blocks.find(b => b.type === 'header');
  assert.strictEqual(header.text.text, '테스트 전체 결과 · 2026-05-21');

  console.log('✅ buildSummaryMessage: integrated e2e+unit');
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: FAIL — `buildSummaryMessage` does not accept `e2eByProject`/`unitByProject`/`testsByProject`.

- [ ] **Step 3: slack-notify.js 리팩터**

`scripts/slack-notify.js`에서 다음을 모두 적용한다.

1) `buildSummaryMessage` 시그니처와 본문을 두 타입을 받도록 변경.
2) `readResultsByProject`를 `readResultsByProject(projects, resultsDir, date, type)`로 변경하고 `path.join(resultsDir, project, type, ...)`을 읽도록 한다. 모듈 사용처(`main`)도 두 번 호출.
3) `calculateSummary`는 generic하게 사용 가능 → 함수명 유지하고 그대로 둔다.
4) 프로젝트 라인 빌더 신규: `buildIntegratedProjectFields`.
5) 종합 상태 결정: 등록된 타입 중 어느 쪽이라도 실패면 ❌, 모두 통과면 ✅.

`scripts/slack-notify.js`의 해당 함수들을 다음으로 교체/추가한다.

```js
function readResultsByProject(projects, resultsDir, date, type) {
  const map = new Map();
  for (const project of projects) {
    const file = path.join(resultsDir, project, type, `${date}.json`);
    if (fs.existsSync(file)) {
      try {
        map.set(project, readJson(file));
      } catch (err) {
        console.warn(`[WARN] Skipping unreadable ${type} result for ${project}: ${file} (${err.message})`);
      }
    }
  }
  return map;
}

function buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject) {
  const fields = [];
  for (const project of projects) {
    const registered = (testsByProject && testsByProject[project]) || [];
    const e2e = e2eByProject.get(project);
    const unit = unitByProject.get(project);

    const e2eText = (() => {
      if (!registered.includes('e2e')) return null;
      if (!e2e) return '결과 없음';
      return `${e2e.passed}/${e2e.total}`;
    })();
    const unitText = (() => {
      if (!registered.includes('unit')) return '-';
      if (!unit) return '결과 없음';
      return `${unit.passed}/${unit.total}`;
    })();

    const e2eDurSec = parseDurationSeconds(e2e?.duration || '');
    const unitDurSec = parseDurationSeconds(unit?.duration || '');
    const durationLabel = (() => {
      const parts = [];
      if (e2e) parts.push(e2e.duration);
      if (unit) parts.push(unit.duration);
      if (parts.length === 0) return '-';
      return parts.join(' + ');
    })();

    const overallFail =
      (registered.includes('e2e') && (!e2e || e2e.status === 'failed')) ||
      (registered.includes('unit') && unit && unit.status === 'failed');
    const overallIcon = overallFail ? '❌' : (registered.length === 0 ? '⚠' : '✅');

    fields.push(markdownText(`*${overallIcon} ${project}*`));
    fields.push(markdownText(`E2E ${e2eText ?? '-'} · Unit ${unitText} · ${durationLabel}`));
    // 명시적 합산도 함께 텍스트로 제공 (디버그/Slack 통일)
    void e2eDurSec; void unitDurSec;
  }
  return fields;
}

function buildSummaryMessage({ date, projects, e2eByProject, unitByProject, testsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);

  const e2eEligible = projects.filter(p => (testsByProject?.[p] || ['e2e']).includes('e2e'));
  const unitEligible = projects.filter(p => (testsByProject?.[p] || []).includes('unit'));

  const e2eSummary = calculateSummary(e2eEligible, e2eByProject);
  const unitSummary = calculateSummary(unitEligible, unitByProject);

  const anyE2eFail = e2eEligible.some(p => {
    const r = e2eByProject.get(p);
    return !r || r.status === 'failed';
  });
  const anyUnitFail = unitEligible.some(p => {
    const r = unitByProject.get(p);
    return r && r.status === 'failed';
  });
  const allGood = !anyE2eFail && !anyUnitFail;
  const summaryIcon = allGood ? '✅' : '❌';
  const statusText = allGood ? '*✅ 전체 통과*' : '*❌ 일부 실패*';

  const e2eFields = [
    markdownText(`*E2E 프로젝트 통과*\n${e2eSummary.passedProjects} / ${e2eEligible.length}`),
    markdownText(`*E2E 테스트 통과*\n${e2eSummary.passed} / ${e2eSummary.total}`),
    markdownText(`*E2E 실패*\n${e2eSummary.failed}건`),
    markdownText(`*E2E 소요시간*\n${formatDurationSeconds(e2eSummary.durationSeconds)}`),
  ];
  const unitFields = [
    markdownText(`*Unit 프로젝트 통과*\n${unitSummary.passedProjects} / ${unitEligible.length}`),
    markdownText(`*Unit 테스트 통과*\n${unitSummary.passed} / ${unitSummary.total}`),
    markdownText(`*Unit 실패*\n${unitSummary.failed}건`),
    markdownText(`*Unit 소요시간*\n${formatDurationSeconds(unitSummary.durationSeconds)}`),
  ];

  const projectFields = buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject);

  const text = [
    `[테스트 전체 결과] ${date}`,
    `${summaryIcon} E2E ${e2eSummary.passed}/${e2eSummary.total} · Unit ${unitSummary.passed}/${unitSummary.total}`,
    `대시보드: ${externalDashboardUrl}`,
  ].join('\n');

  const blocks = [
    { type: 'header', text: plainText(`테스트 전체 결과 · ${date}`) },
    { type: 'section', text: markdownText(statusText) },
    { type: 'section', fields: e2eFields },
    { type: 'section', fields: unitFields },
    { type: 'divider' },
    ...chunkFields(projectFields, 10).map(fields => ({ type: 'section', fields })),
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: plainText('대시보드 열기'), url: externalDashboardUrl, action_id: 'open_dashboard' },
      ],
    },
  ];

  return { text, blocks };
}
```

그리고 `main`의 `--summary` 분기에서 두 타입을 모두 로드하고 `testsByProject`도 manifest에서 읽도록 수정한다.

```js
if (argv[0] === '--summary') {
  const [, date, projectsDir, resultsDir] = argv;
  if (!date || !projectsDir || !resultsDir) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const projects = readProjectNames(projectsDir);

  // testsByProject: config.json에서 직접 계산
  const testsByProject = {};
  for (const project of projects) {
    const cfgPath = path.join(projectsDir, project, 'config.json');
    let cfg = {};
    try { cfg = readJson(cfgPath); } catch { /* ignore */ }
    const types = [];
    if (typeof cfg.e2e_command === 'string' && cfg.e2e_command.length > 0) types.push('e2e');
    if (typeof cfg.unit_command === 'string' && cfg.unit_command.length > 0) types.push('unit');
    testsByProject[project] = types;
  }

  const e2eByProject = readResultsByProject(projects, resultsDir, date, 'e2e');
  const unitByProject = readResultsByProject(projects, resultsDir, date, 'unit');

  message = buildSummaryMessage({
    date,
    projects,
    e2eByProject,
    unitByProject,
    testsByProject,
    dashboardUrl: env.DASHBOARD_URL,
  });
}
```

마지막으로 module.exports에 `buildIntegratedProjectFields`는 노출하지 않아도 된다. 단 `readResultsByProject`는 시그니처가 바뀌었으므로 기존 테스트도 영향을 받는다.

- [ ] **Step 4: 기존 테스트 케이스 마이그레이션**

`scripts/__tests__/slack-notify.test.js`의 기존 시나리오들에서 `buildSummaryMessage` 호출에 새 인자를 맞춰 변환한다. 기존 `resultsByProject` (E2E 한 종류)는 두 갈래로 분리:

```js
const e2eByProject = resultsByProject;
const unitByProject = new Map();
const testsByProject = Object.fromEntries(projects.map(p => [p, ['e2e']]));

const message = buildSummaryMessage({
  date: '2026-05-11',
  projects,
  e2eByProject,
  unitByProject,
  testsByProject,
  dashboardUrl: 'http://example.com:8080',
});
```

기존 `assertProjectRow`는 표시 포맷이 바뀌었으므로 새 헬퍼로 교체한다.

```js
function assertContainsField(payload, text) {
  const found = payload.blocks.some(block =>
    block.type === 'section' && Array.isArray(block.fields) &&
    block.fields.some(f => f.text === text)
  );
  assert.ok(found, `missing field: ${text}`);
}
```

그리고 기존 시나리오에서 단언을 `assertProjectRow(message, '*✅ ca-admin*', '50/50 통과 · 실패 0건 · 3분 42초')` 형태였던 것을 새 포맷으로 갱신한다.

```js
assertContainsField(message, '*✅ ca-admin*');
assertContainsField(message, 'E2E 50/50 · Unit - · 3분 42초');

assertContainsField(message, '*❌ typist*');
assertContainsField(message, 'E2E 47/50 · Unit - · 2분 10초');

// cv-view는 결과 없음
assertContainsField(message, '*❌ cv-view*');
assertContainsField(message, 'E2E 결과 없음 · Unit - · -');
```

기존 케이스에서 헤더 텍스트 단언이 있다면 `'E2E 테스트 전체 결과 · ...'` → `'테스트 전체 결과 · ...'`로 변경. 본문 fallback `text` 단언도 새 포맷에 맞춰 수정.

- [ ] **Step 5: 테스트 통과 확인**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: PASS — 기존 시나리오 + 새 통합 시나리오 모두 성공.

- [ ] **Step 6: 커밋**

```bash
git add scripts/slack-notify.js scripts/__tests__/slack-notify.test.js
git commit -m "♻️ slack-notify: E2E/Unit 통합 요약 메시지"
```

---

## Task 11: 대시보드 — Manifest/타입 확장 (TDD)

**Files:**
- Modify: `dashboard/src/types.ts`
- Modify: `dashboard/src/api.ts`
- Modify: `dashboard/src/__tests__/api.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/src/__tests__/api.test.ts`의 기존 fetch 모킹 패턴을 따라가서 다음 케이스를 추가한다. (파일이 작다면 전체를 보고 동일 스타일로 추가.)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchE2eResult, fetchUnitResult, fetchManifest } from '../api';

describe('manifest with tests map', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('parses tests map', async () => {
    const stub = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: ['ca-admin', 'biz-admin'],
        tests: { 'ca-admin': ['e2e', 'unit'], 'biz-admin': ['e2e'] },
        lastUpdated: '2026-05-21T03:00:00.000Z',
      }),
    } as Response);
    const m = await fetchManifest();
    expect(m.tests['ca-admin']).toEqual(['e2e', 'unit']);
    expect(m.tests['biz-admin']).toEqual(['e2e']);
    stub.mockRestore();
  });
});

describe('fetchE2eResult / fetchUnitResult', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetchE2eResult hits /results/<project>/e2e/<date>.json', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ project: 'ca-admin', type: 'e2e', date: '2026-05-21', status: 'passed', total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, duration: '1초' }),
    } as Response);
    const r = await fetchE2eResult('ca-admin', '2026-05-21');
    expect(fetchSpy).toHaveBeenCalledWith('/results/ca-admin/e2e/2026-05-21.json');
    expect(r?.type).toBe('e2e');
  });

  it('fetchUnitResult hits /results/<project>/unit/<date>.json', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ project: 'ca-admin', type: 'unit', framework: 'vitest', date: '2026-05-21', status: 'passed', total: 5, passed: 5, failed: 0, skipped: 0, duration: '2초' }),
    } as Response);
    const r = await fetchUnitResult('ca-admin', '2026-05-21');
    expect(fetchSpy).toHaveBeenCalledWith('/results/ca-admin/unit/2026-05-21.json');
    expect(r?.framework).toBe('vitest');
  });
});
```

기존 `fetchResult` 케이스가 있으면 함께 두되, 단일 함수 호출을 `fetchE2eResult`로 마이그레이션한다 (테스트 파일 안의 모든 `fetchResult` 호출을 `fetchE2eResult`로 변경).

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd dashboard && pnpm test`
Expected: FAIL — `fetchE2eResult`/`fetchUnitResult` not exported, `Manifest.tests` not on type.

- [ ] **Step 3: types.ts 갱신**

```ts
export interface Manifest {
  projects: string[];
  tests: Record<string, ('e2e' | 'unit')[]>;
  lastUpdated: string;
}

export interface UnitTestFailure {
  test: string;
  file: string;
  line: number;
  error: string;
}

export interface UnitTestResult {
  project: string;
  type: 'unit';
  date: string;
  status: 'passed' | 'failed';
  framework: 'vitest' | 'jest' | 'unknown';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: UnitTestFailure[];
  slowTests: SlowTest[];
}
```

기존 `TestResult`는 그대로 E2E를 표현하므로 변경 없음.

- [ ] **Step 4: api.ts 갱신**

```ts
import type { Manifest, TestResult, UnitTestResult } from './types';

const BASE = '/results';

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const raw = await res.json();
  return {
    projects: raw.projects ?? [],
    tests: raw.tests ?? Object.fromEntries((raw.projects ?? []).map((p: string) => [p, ['e2e']])),
    lastUpdated: raw.lastUpdated ?? '',
  };
}

async function fetchJsonOrNull<T>(url: string, defaults: Partial<T>): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text) as Partial<T>;
    return { ...defaults, ...parsed } as T;
  } catch {
    return null;
  }
}

export async function fetchE2eResult(project: string, date: string): Promise<TestResult | null> {
  return fetchJsonOrNull<TestResult>(`${BASE}/${project}/e2e/${date}.json`, {
    flaky: 0,
    browsers: [],
    failures: [],
    flakyTests: [],
    slowTests: [],
  });
}

export async function fetchUnitResult(project: string, date: string): Promise<UnitTestResult | null> {
  return fetchJsonOrNull<UnitTestResult>(`${BASE}/${project}/unit/${date}.json`, {
    failures: [],
    slowTests: [],
  });
}

function localDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return localDateString(d);
  });
}
```

> 기존 `fetchResult` export를 제거하면 App.tsx에서 깨진다. 다음 Task에서 App.tsx를 업데이트하므로 일단 `export const fetchResult = fetchE2eResult;` 한 줄 alias를 추가해 둘 수도 있지만, 깔끔하게 한 번에 정리하기 위해 alias는 두지 않고 다음 Task에서 모든 import를 갱신한다. (현재 단계에서 `pnpm tsc -b`가 실패해도 다음 Task까지 무방.)

- [ ] **Step 5: api 테스트 통과 확인**

Run: `cd dashboard && pnpm test -- src/__tests__/api.test.ts`
Expected: PASS (다른 테스트 파일은 컴파일 에러일 수 있음 — 다음 Task에서 해결).

- [ ] **Step 6: 커밋**

```bash
git add dashboard/src/types.ts dashboard/src/api.ts dashboard/src/__tests__/api.test.ts
git commit -m "✨ dashboard: Manifest tests 맵, fetchE2eResult/fetchUnitResult 분리"
```

---

## Task 12: 대시보드 App.tsx — 두 타입 모두 로드

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: ProjectData 타입 확장 및 로드 로직 갱신**

`dashboard/src/App.tsx` 상단 imports를 변경한다.

```tsx
import { useEffect, useState } from 'react';
import { fetchManifest, fetchE2eResult, fetchUnitResult, last30Days } from './api';
import { ProjectGrid } from './components/ProjectGrid';
import { ProjectCard } from './components/ProjectCard';
import { computeTrend } from './lib/trend';
import type { TestResult, UnitTestResult } from './types';

export type RegisteredTypes = ('e2e' | 'unit')[];

export type ProjectData = {
  name: string;
  registered: RegisteredTypes;
  e2eLatest: TestResult | null;
  e2eHistory: TestResult[];
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  unitHistory: UnitTestResult[];
};
```

로드 effect 안의 매핑을 다음으로 교체.

```tsx
const days = last30Days();
const projectData = await Promise.all(
  manifest.projects.map(async name => {
    const registered = manifest.tests[name] ?? ['e2e'];
    const wantsE2e = registered.includes('e2e');
    const wantsUnit = registered.includes('unit');

    const [e2eResults, unitResults] = await Promise.all([
      wantsE2e
        ? Promise.all(days.map(date => fetchE2eResult(name, date))).then(arr => arr.filter((r): r is TestResult => r !== null))
        : Promise.resolve([] as TestResult[]),
      wantsUnit
        ? Promise.all(days.map(date => fetchUnitResult(name, date))).then(arr => arr.filter((r): r is UnitTestResult => r !== null))
        : Promise.resolve([] as UnitTestResult[]),
    ]);

    return {
      name,
      registered,
      e2eLatest: e2eResults[0] ?? null,
      e2eHistory: e2eResults,
      e2eTrend: computeTrend(e2eResults),
      unitLatest: unitResults[0] ?? null,
      unitHistory: unitResults,
    };
  })
);
setProjects(projectData);
```

SummaryBar 계산은 종합 상태 기반으로 갱신:

```tsx
const passedCount = projects.filter(p => isProjectPassing(p)).length;
const failedCount = projects.filter(p => isProjectFailing(p)).length;
const flakyTotal = projects.reduce((sum, p) => sum + (p.e2eLatest?.flaky || 0), 0);
const totalTests =
  projects.reduce((sum, p) => sum + (p.e2eLatest?.total || 0), 0) +
  projects.reduce((sum, p) => sum + (p.unitLatest?.total || 0), 0);
const passedTests =
  projects.reduce((sum, p) => sum + (p.e2eLatest?.passed || 0), 0) +
  projects.reduce((sum, p) => sum + (p.unitLatest?.passed || 0), 0);
```

같은 파일 하단에 헬퍼 추가:

```tsx
function isProjectPassing(p: ProjectData) {
  if (p.registered.length === 0) return false;
  if (p.registered.includes('e2e') && (!p.e2eLatest || p.e2eLatest.failed > 0)) return false;
  if (p.registered.includes('unit') && p.unitLatest && p.unitLatest.failed > 0) return false;
  return Boolean(p.e2eLatest || p.unitLatest);
}

function isProjectFailing(p: ProjectData) {
  if (p.registered.includes('e2e') && p.e2eLatest && p.e2eLatest.failed > 0) return true;
  if (p.registered.includes('unit') && p.unitLatest && p.unitLatest.failed > 0) return true;
  return false;
}
```

ProjectCard 호출 부분도 새 필드를 전달하도록 변경. (다음 Task에서 ProjectCard 시그니처를 마저 정리.)

```tsx
<ProjectCard
  projectName={selectedProject.name}
  registered={selectedProject.registered}
  e2eLatest={selectedProject.e2eLatest}
  e2eHistory={selectedProject.e2eHistory}
  e2eTrend={selectedProject.e2eTrend}
  unitLatest={selectedProject.unitLatest}
  unitHistory={selectedProject.unitHistory}
/>
```

- [ ] **Step 2: 타입체크**

Run: `cd dashboard && pnpm tsc -b`
Expected: ProjectCard/ProjectTile prop mismatch만 남는다 (다음 두 Task에서 해결).

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/App.tsx
git commit -m "♻️ App.tsx: E2E/Unit 두 타입 모두 로드"
```

---

## Task 13: ProjectTile — E2E/Unit 두 줄 표시

**Files:**
- Modify: `dashboard/src/components/ProjectTile.tsx`
- Modify: `dashboard/src/components/ProjectGrid.tsx` (props 패스스루)

- [ ] **Step 1: ProjectTile.tsx 확인 및 prop 확장**

먼저 `dashboard/src/components/ProjectTile.tsx`를 열어 현재 구조를 확인하고, 단일 latest result만 보고 있던 prop을 두 타입으로 확장한다.

새 props:
```ts
type ProjectTileProps = {
  name: string;
  registered: ('e2e' | 'unit')[];
  e2eLatest: TestResult | null;
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  onSelect(): void;
};
```

타일 본문은 다음 두 줄을 포함한다 (기존 sparkline은 E2E 줄 옆에 그대로 둔다).

```tsx
<div className="tile-row tile-row-e2e">
  <span className="tile-row-label">E2E</span>
  {registered.includes('e2e')
    ? e2eLatest
      ? <TileStats passed={e2eLatest.passed} total={e2eLatest.total} failed={e2eLatest.failed} duration={e2eLatest.duration} status={e2eLatest.status} />
      : <span className="tile-row-empty">결과 없음</span>
    : <span className="tile-row-empty">등록 안 됨</span>}
</div>
<div className="tile-row tile-row-unit">
  <span className="tile-row-label">Unit</span>
  {registered.includes('unit')
    ? unitLatest
      ? <TileStats passed={unitLatest.passed} total={unitLatest.total} failed={unitLatest.failed} duration={unitLatest.duration} status={unitLatest.status} />
      : <span className="tile-row-empty">결과 없음</span>
    : <span className="tile-row-empty">등록 안 됨</span>}
</div>
```

`TileStats`는 동일 파일 안에 작은 컴포넌트로 정의한다.

```tsx
function TileStats({ passed, total, failed, duration, status }: { passed: number; total: number; failed: number; duration: string; status: 'passed'|'failed' }) {
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <span>
      <span data-status={status}>{passed}/{total}</span>
      <span> · 실패 {failed}</span>
      <span> · {duration}</span>
      <span style={{ marginLeft: 6, opacity: 0.6 }}>({passRate}%)</span>
    </span>
  );
}
```

종합 상태 배지(통과/실패/데이터 없음)는 등록된 모든 타입 기준으로 결정한다.

```ts
function overallBadge(registered: string[], e2eLatest: TestResult | null, unitLatest: UnitTestResult | null) {
  const anyData = e2eLatest || unitLatest;
  if (!anyData) return 'no-data';
  const e2eFail = registered.includes('e2e') && (!e2eLatest || e2eLatest.failed > 0);
  const unitFail = registered.includes('unit') && unitLatest && unitLatest.failed > 0;
  return (e2eFail || unitFail) ? 'failed' : 'passed';
}
```

- [ ] **Step 2: ProjectGrid.tsx pass-through 갱신**

`dashboard/src/components/ProjectGrid.tsx`에서 `ProjectTile`을 호출하는 부분의 props를 `ProjectData`의 새 필드로 전달하도록 변경.

```tsx
{projects.map(p => (
  <ProjectTile
    key={p.name}
    name={p.name}
    registered={p.registered}
    e2eLatest={p.e2eLatest}
    e2eTrend={p.e2eTrend}
    unitLatest={p.unitLatest}
    onSelect={() => onSelect(p.name)}
  />
))}
```

`ProjectGrid` props 타입에서 `projects: ProjectData[]`를 그대로 받되 import에서 `ProjectData`를 App.tsx에서 export한 타입을 쓴다.

- [ ] **Step 3: 타입체크**

Run: `cd dashboard && pnpm tsc -b`
Expected: PASS for ProjectTile/ProjectGrid. ProjectCard prop mismatch는 다음 Task에서 해결.

- [ ] **Step 4: 커밋**

```bash
git add dashboard/src/components/ProjectTile.tsx dashboard/src/components/ProjectGrid.tsx
git commit -m "🎨 ProjectTile: E2E/Unit 두 줄 표시"
```

---

## Task 14: ProjectCard 상세 페이지에 탭 + Unit 콘텐츠

**Files:**
- Modify: `dashboard/src/components/ProjectCard.tsx`
- Create: `dashboard/src/components/UnitDetail.tsx`

- [ ] **Step 1: UnitDetail.tsx 신규**

`dashboard/src/components/UnitDetail.tsx`를 새로 만든다.

```tsx
import type { UnitTestResult } from '../types';

export function UnitDetail({ latest, history }: { latest: UnitTestResult | null; history: UnitTestResult[] }) {
  if (!latest) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        유닛테스트 결과가 없습니다.
      </div>
    );
  }
  const passRate = latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2)', fontFamily: 'var(--font-mono)' }}>
          {latest.framework}
        </span>
        <span data-status={latest.status} style={{ fontWeight: 600 }}>
          {latest.passed}/{latest.total} 통과
        </span>
        <span style={{ color: 'var(--text-muted)' }}>실패 {latest.failed}건</span>
        <span style={{ color: 'var(--text-muted)' }}>· {latest.duration}</span>
        <span style={{ color: 'var(--text-muted)' }}>· {passRate}%</span>
      </header>

      {latest.failures.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>실패 목록</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            {latest.failures.map((f, i) => (
              <li key={i} style={{ borderLeft: '3px solid var(--danger)', padding: '6px 10px', background: 'var(--danger-muted)', borderRadius: 4 }}>
                <div style={{ fontWeight: 600 }}>{f.test}</div>
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.file}{f.line ? `:${f.line}` : ''}</div>
                {f.error && <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{f.error}</pre>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.slowTests.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>느린 테스트</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {latest.slowTests.map((s, i) => (
              <li key={i}>{s.durationMs} ms · {s.test} <span style={{ color: 'var(--text-muted)' }}>({s.file})</span></li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 1 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>30일 히스토리</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {history.slice(0, 30).map(h => (
              <li key={h.date} data-status={h.status}>
                {h.date} · {h.passed}/{h.total} · {h.duration}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ProjectCard.tsx 탭 추가**

기존 `ProjectCard` 시그니처를 다음으로 교체.

```tsx
import { useState } from 'react';
import type { TestResult, UnitTestResult } from '../types';
import { UnitDetail } from './UnitDetail';
// 기존 import들 유지

export type ProjectCardProps = {
  projectName: string;
  registered: ('e2e' | 'unit')[];
  e2eLatest: TestResult | null;
  e2eHistory: TestResult[];
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  unitHistory: UnitTestResult[];
};

export function ProjectCard(props: ProjectCardProps) {
  const { projectName, registered, e2eLatest, e2eHistory, e2eTrend, unitLatest, unitHistory } = props;
  const defaultTab: 'e2e' | 'unit' = registered.includes('e2e') ? 'e2e' : 'unit';
  const [tab, setTab] = useState<'e2e' | 'unit'>(defaultTab);

  return (
    <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--surface-1)' }}>
      <header style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{projectName}</h2>
      </header>

      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
        <TabButton
          active={tab === 'e2e'}
          disabled={!registered.includes('e2e')}
          onClick={() => setTab('e2e')}
          label="E2E"
        />
        <TabButton
          active={tab === 'unit'}
          disabled={!registered.includes('unit')}
          onClick={() => setTab('unit')}
          label="Unit"
        />
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'e2e' ? (
          registered.includes('e2e')
            ? <E2eDetail latest={e2eLatest} history={e2eHistory} trend={e2eTrend} />
            : <NotRegistered label="E2E" />
        ) : (
          registered.includes('unit')
            ? <UnitDetail latest={unitLatest} history={unitHistory} />
            : <NotRegistered label="Unit" />
        )}
      </div>
    </section>
  );
}

function TabButton({ active, disabled, onClick, label }: { active: boolean; disabled: boolean; onClick(): void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '10px 14px',
        background: active ? 'var(--surface-2)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function NotRegistered({ label }: { label: string }) {
  return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
      이 프로젝트는 {label} 테스트가 등록되지 않았습니다.
    </div>
  );
}
```

기존 ProjectCard에 있던 E2E 상세 콘텐츠(브라우저 매트릭스, 실패 리스트, 느린 테스트, 히스토리)는 `E2eDetail`이라는 별도 컴포넌트로 묶어 같은 파일 안에 둔다. 즉 기존 ProjectCard 본문을 그대로 `function E2eDetail({ latest, history, trend })`로 옮긴다. 옮길 때 prop 이름만 `latest`/`history`/`trend`로 통일한다.

- [ ] **Step 3: 타입체크 + 빌드**

Run: `cd dashboard && pnpm tsc -b && pnpm build`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add dashboard/src/components/ProjectCard.tsx dashboard/src/components/UnitDetail.tsx
git commit -m "🎨 ProjectCard: E2E/Unit 탭 + UnitDetail 추가"
```

---

## Task 15: 대시보드 App.test.tsx 갱신 (두 타입 로드 검증)

**Files:**
- Modify: `dashboard/src/__tests__/App.test.tsx`

- [ ] **Step 1: 테스트 갱신**

기존 App.test.tsx의 manifest fetch mock에 `tests` 맵을 추가하고, `e2e`/`unit` 경로로 분리된 fetch를 모킹한다.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

describe('App with e2e + unit', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('shows project tile with E2E and Unit rows', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url: any) => {
      const u = String(url);
      if (u.endsWith('/manifest.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            projects: ['ca-admin'],
            tests: { 'ca-admin': ['e2e', 'unit'] },
            lastUpdated: '2026-05-21T00:00:00.000Z',
          }),
        } as Response);
      }
      if (/\/results\/ca-admin\/e2e\/.*\.json$/.test(u)) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({
            project: 'ca-admin', type: 'e2e', date: '2026-05-21', status: 'passed',
            total: 21, passed: 19, failed: 0, flaky: 2, skipped: 0, duration: '41초',
            browsers: [], failures: [], flakyTests: [], slowTests: [],
          }),
        } as Response);
      }
      if (/\/results\/ca-admin\/unit\/.*\.json$/.test(u)) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({
            project: 'ca-admin', type: 'unit', framework: 'vitest', date: '2026-05-21', status: 'passed',
            total: 120, passed: 118, failed: 0, skipped: 2, duration: '12초',
            failures: [], slowTests: [],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText('ca-admin')).toBeInTheDocument());
    expect(screen.getByText('E2E')).toBeInTheDocument();
    expect(screen.getByText('Unit')).toBeInTheDocument();
    expect(screen.getByText(/19\/21/)).toBeInTheDocument();
    expect(screen.getByText(/118\/120/)).toBeInTheDocument();
  });
});
```

기존 케이스가 있다면 그대로 유지하되 fetch URL이 e2e/ 하위로 바뀌었으므로 모킹 패턴을 동일하게 갱신한다.

- [ ] **Step 2: 테스트 실행**

Run: `cd dashboard && pnpm test`
Expected: PASS — App + api 모두.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/__tests__/App.test.tsx
git commit -m "✅ App.test: e2e/unit 두 타입 로드 검증"
```

---

## Task 16: docs/spec.md 갱신

**Files:**
- Modify: `docs/spec.md`

- [ ] **Step 1: 문서 갱신**

다음 섹션을 갱신한다.

1) "프로젝트 config.json 형식" 섹션의 예제 JSON과 설명을 새 키로 교체.

```json
{
  "name": "ca-admin",
  "path": "/Users/yongho/projects/ca-admin",
  "e2e_command": "pnpm playwright test --reporter=json",
  "unit_command": "pnpm vitest run --reporter=json",
  "slack_channel": "#qa-alerts"
}
```

- `e2e_command`가 없으면 해당 프로젝트의 E2E는 skip, 결과 파일도 생성하지 않는다.
- `unit_command`가 없으면 유닛테스트는 skip되고 Slack/대시보드에 `Unit -`로 표시된다.
- Playwright JSON reporter 옵션 포함이 필요한 것은 동일. 유닛테스트는 Vitest 또는 Jest의 JSON reporter를 사용해야 한다.

2) "프로젝트 구조" 다이어그램에서 `results/ca-admin/2026-05-08.json`을 `results/ca-admin/e2e/2026-05-08.json` + `results/ca-admin/unit/2026-05-08.json`으로 갱신.

3) "실행 결과 JSON 형식"을 두 섹션으로 분리.

```markdown
### E2E 결과 JSON

`results/[project]/e2e/YYYY-MM-DD.json`. 기존 Playwright 파싱 결과에 `"type": "e2e"` 필드만 추가.

### 유닛테스트 결과 JSON

`results/[project]/unit/YYYY-MM-DD.json`.

​```json
{
  "project": "ca-admin",
  "type": "unit",
  "date": "2026-05-21",
  "status": "passed",
  "framework": "vitest",
  "total": 120,
  "passed": 118,
  "failed": 2,
  "skipped": 0,
  "duration": "12초",
  "failures": [{ "test": "...", "file": "...", "line": 14, "error": "..." }],
  "slowTests": [{ "test": "...", "file": "...", "durationMs": 850 }]
}
​```

`framework`는 `unit_command`의 단어로 우선 식별, 실패 시 reporter 출력 마커로 fallback. 식별 안 되면 `"unknown"`.
```

4) "Slack 알림 형식" 섹션을 spec 문서의 새 형식과 일치하도록 갱신 (Header: `테스트 전체 결과`, Summary 두 섹션, 프로젝트 라인 `E2E .. · Unit .. · <시간 합산>`).

5) "manifest.json 형식" 작은 섹션을 추가 (Spec 문서에서 정의한 `tests` 맵 포함).

6) "대시보드 요구사항"에 탭 UI와 unit 처리를 추가.

7) "새 프로젝트 추가 방법"에 `unit_command` 등록 안내 한 줄 추가.

- [ ] **Step 2: 커밋**

```bash
git add docs/spec.md
git commit -m "📝 spec.md: 유닛테스트 통합 반영"
```

---

## Task 17: README.md 보완

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README의 config 예제 갱신**

`README.md`에서 "프로젝트 config 확인" 섹션의 config 예제와 설명을 다음으로 교체한다.

```json
{
  "name": "ca-admin",
  "path": "/Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin",
  "e2e_command": "pnpm playwright test --reporter=json",
  "unit_command": "pnpm vitest run --reporter=json",
  "slack_channel": "#qa-alerts"
}
```

설명에 다음 두 줄을 추가한다.

- `unit_command`가 없으면 해당 프로젝트는 유닛테스트가 skip된다. 대시보드와 Slack에는 `등록 안 됨`/`Unit -`로 표시된다.
- `e2e_command`/`unit_command` 모두 JSON reporter 옵션(`--reporter=json` 등)을 포함해야 한다.

또 "동작 흐름" bullet 2개의 `results/[project]/YYYY-MM-DD.json`를 `results/[project]/{e2e,unit}/YYYY-MM-DD.json`으로 갱신.

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "📝 README: e2e_command / unit_command 안내"
```

---

## Task 18: 통합 동작 검증 (수동)

**Files:** 변경 없음

- [ ] **Step 1: 단위 테스트 일괄 실행**

```bash
node scripts/__tests__/parse-pw-results.test.js
node scripts/__tests__/parse-unit-results.test.js
node scripts/__tests__/migrate-results-layout.test.js
node scripts/__tests__/run-project.test.js
node scripts/__tests__/slack-notify.test.js
```
Expected: 모든 케이스 통과.

- [ ] **Step 2: 대시보드 테스트**

```bash
cd dashboard && pnpm test
```
Expected: 모든 케이스 통과.

- [ ] **Step 3: 대시보드 빌드**

```bash
cd dashboard && pnpm build
```
Expected: 빌드 성공.

- [ ] **Step 4: 마이그레이션 dry-run (선택)**

기존 `results/` 폴더의 백업을 만들고 마이그레이션을 한 번 돌려서 결과를 확인.

```bash
cp -R results results.bak
bash scripts/migrate-results-layout.sh
ls results/ca-admin/e2e/ | head
ls results/ca-admin/ | grep -E '^[0-9]{4}-' || echo "no legacy files remain"
```
Expected: 기존 날짜 JSON이 e2e/ 하위로 이동했고 루트 레벨에는 더 이상 날짜 JSON이 없음. 문제 없으면 `rm -rf results.bak`.

- [ ] **Step 5: docker-compose 대시보드 확인 (선택, 수동)**

```bash
docker-compose up -d
open http://localhost:8080
```

확인 항목:
- 프로젝트 그리드에 각 타일이 E2E/Unit 두 줄로 표시.
- `unit_command` 미등록 프로젝트는 Unit 줄에 `등록 안 됨`.
- 프로젝트 클릭 시 상세 페이지의 E2E/Unit 탭 전환이 동작.
- Unit 미등록 프로젝트의 Unit 탭은 비활성화.

- [ ] **Step 6: 종료 커밋 (변경 없으면 skip)**

검증 중 자잘한 수정이 생겼다면 한 커밋으로 묶고, 아니면 그대로 종료한다.

---

## Self-Review Notes (작성자용 메모)

플랜 작성 후 spec 대비 누락 확인:

1. **Spec 1.1 — type 명시화**: Task 1, Task 2 (type 'unit' 필드)에서 처리.
2. **Spec 2 — config 변경 (e2e_command/unit_command)**: Task 7 (12 config 일괄), Task 8 (run-project 읽기 로직).
3. **Spec 3 — 결과 저장 레이아웃 + manifest tests 맵**: Task 6 (마이그레이션), Task 8 (저장 경로), Task 9 (manifest tests).
4. **Spec 4 — Unit 결과 스키마 (framework auto-detect 포함)**: Task 2~5.
5. **Spec 5 — 스크립트 변경 (run-project, parse-unit, run-all, migrate)**: Task 6, 8, 9.
6. **Spec 6 — Slack 통합 메시지**: Task 10.
7. **Spec 7 — 대시보드 (메인 그리드 두 줄, 상세 탭, 데이터 로딩)**: Task 11~15.
8. **Spec 8 — 테스트 (parse-unit, migrate, slack 갱신)**: Task 2~6, 10, 15.
9. **Spec 9 — 마이그레이션 계획 (자동 호출)**: Task 9 step 1 + Task 6.
10. **Spec — 비범위 (커버리지 등)**: 플랜에 포함하지 않음.

플레이스홀더 스캔: 없음. 모든 단계가 실제 커맨드/코드 포함.

타입 일관성: `parseUnitResults` / `fetchUnitResult` / `UnitTestResult` / `unit_command` — Task 2부터 15까지 동일하게 사용.

한 가지 알려진 트레이드오프: Task 8 Step 5의 unit 시나리오에서 `framework` 단언은 raw 마커 fallback에 의존한다. 만약 그 fallback이 실패하면 `framework: 'unknown'`이 되므로, 픽스처에서 `startTime: 1`(또는 양수)로 명시하라는 메모를 남겨두었다.
