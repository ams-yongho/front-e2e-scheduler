# Slack 프로젝트 결과 E2E/Unit 컬럼 분리 (도표 테이블) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slack 요약 메시지의 하단 프로젝트 영역을 현재의 합산 한 줄(`E2E x/y · Unit a/b · 소요시간`)에서 `프로젝트 | E2E | Unit` 3컬럼 정렬 도표(monospace 코드블록)로 변경한다.

**Architecture:** Slack 메시지는 여전히 **1개**만 전송한다. 헤더(`테스트 전체 결과 · DATE`), E2E/Unit 집계 요약 섹션, 대시보드 버튼은 그대로 유지한다. 변경 범위는 per-project 섹션 한 곳뿐이다: Block Kit `fields`(2개/프로젝트) → monospace 코드블록 안의 정렬 테이블. 프로젝트별 소요시간 컬럼은 제거한다(집계 요약의 `E2E 소요시간`/`Unit 소요시간`에 이미 표시됨).

**Tech Stack:** Node.js (의존성 없음), Slack Incoming Webhook Block Kit, 테스트는 `node`로 직접 실행하는 플레인 `assert` 스크립트.

---

## File Structure

- `scripts/slack-notify.js` — 변경. 헬퍼 3개(`displayWidth`, `padEndW`, `padStartW`)와 `buildProjectTableBlocks()`를 추가하고, `buildSummaryMessage()`가 이를 쓰도록 교체. 죽은 코드 `buildIntegratedProjectFields()`/`chunkFields()` 제거. `buildProjectTableBlocks`를 export.
- `scripts/__tests__/slack-notify.test.js` — 변경. 테이블 전용 신규 테스트 블록 추가. 구 포맷(`E2E .. · Unit .. · ..`, `block.fields`)을 검사하던 깨지는 assertion들을 테이블 포맷 검사로 교체.
- `docs/spec.md` — 변경. "Slack 알림 형식" 4번 항목을 도표 테이블 설명으로 갱신.

## 배경: 현재 코드의 관련 지점

`scripts/slack-notify.js`:
- `buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject)` (현재 91–127행): 프로젝트마다 `markdownText('*{icon} {project}*')`와 `markdownText('E2E .. · Unit .. · {duration}')` 두 필드를 만든다. **이 함수가 교체 대상.**
- `chunkFields(fields, chunkSize)` (현재 129–135행): 위 필드를 10개씩 section으로 쪼갠다. 테이블 전환 후 사용처가 없어지므로 **제거.**
- `buildSummaryMessage(...)` (현재 137–196행): 내부에서 `const projectFields = buildIntegratedProjectFields(...)`를 만들고 `...chunkFields(projectFields, 10).map(fields => ({ type: 'section', fields }))`를 blocks에 펼친다. **이 두 줄을 테이블 블록으로 교체.**
- 파일 맨 아래 `module.exports` (현재 324–331행): `buildSingleResultMessage, buildSummaryMessage, readProjectNames, readResultsByProject, sendSlackMessage, validateDashboardUrl`. **`buildProjectTableBlocks` 추가.**

셀 텍스트 규칙(기존 `buildIntegratedProjectFields`에서 그대로 가져옴):
- E2E 셀: `e2e` 미등록 → `'-'`, 등록됐는데 결과 없음 → `'결과 없음'`, 그 외 → `'{passed}/{total}'`
- Unit 셀: `unit` 미등록 → `'-'`, 등록됐는데 결과 없음 → `'결과 없음'`, `status === 'error'` → `'수집 실패'`, 그 외 → `'{passed}/{total}'`
- 아이콘: `overallFail`이면 `❌`, 등록 타입이 하나도 없으면 `⚠`, 아니면 `✅`. `overallFail = (e2e 등록 && (결과없음 || status==='failed')) || (unit 등록 && (결과없음 || status!=='passed'))`

테스트 실행 방법(이 저장소 관례 — 테스트 러너/`package.json` 없음, 파일을 직접 실행):
```bash
node scripts/__tests__/slack-notify.test.js
```

---

## Task 1: 테이블 빌더 헬퍼 + `buildProjectTableBlocks` 추가 (TDD)

**Files:**
- Modify: `scripts/slack-notify.js`
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/__tests__/slack-notify.test.js` **맨 끝**에 아래 블록을 추가한다. 파일 상단의 `require('../slack-notify')` 구조분해에 `buildProjectTableBlocks`를 추가해야 한다 — 현재(9–14행):

```js
const {
  buildSummaryMessage,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
} = require('../slack-notify');
```

위를 다음으로 교체한다:

```js
const {
  buildProjectTableBlocks,
  buildSummaryMessage,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
} = require('../slack-notify');
```

그리고 파일 맨 끝에 다음 테스트 블록을 추가한다:

```js
// === 프로젝트 도표 테이블 ===
{
  // (a) 정확한 정렬 포맷 핀 (작은 픽스처)
  const e2e = new Map([['ca-admin', { project: 'ca-admin', type: 'e2e', status: 'passed', total: 21, passed: 19, failed: 0, duration: '41초' }]]);
  const unit = new Map([['ca-admin', { project: 'ca-admin', type: 'unit', status: 'passed', total: 120, passed: 118, failed: 0, duration: '12초' }]]);
  const tests = { 'ca-admin': ['e2e', 'unit'] };

  const blocks = buildProjectTableBlocks(['ca-admin'], e2e, unit, tests);
  assert.strictEqual(blocks.length, 1, '단일 청크여야 함');
  assert.strictEqual(blocks[0].type, 'section');
  assert.strictEqual(blocks[0].text.type, 'mrkdwn');
  assert.strictEqual(
    blocks[0].text.text,
    '```\n   프로젝트    E2E     Unit\n✅ ca-admin  19/21  118/120\n```'
  );

  // (b) 셀 규칙: 미등록 '-', 결과 없음, 수집 실패
  const projects = ['ca-admin', 'typist', 'scm-front', 'cv-view'];
  const e2e2 = new Map([
    ['ca-admin', { status: 'passed', total: 50, passed: 50 }],
    ['typist', { status: 'failed', total: 50, passed: 47 }],
    ['scm-front', { status: 'passed', total: 0, passed: 0 }],
  ]);
  const unit2 = new Map([
    ['ca-admin', { status: 'passed', total: 120, passed: 118 }],
    ['scm-front', { status: 'error', error: 'timeout' }],
  ]);
  const tests2 = {
    'ca-admin': ['e2e', 'unit'],
    'typist': ['e2e'],
    'scm-front': ['e2e', 'unit'],
    'cv-view': ['e2e'],
  };
  const text = buildProjectTableBlocks(projects, e2e2, unit2, tests2)
    .map(b => b.text.text).join('\n');
  const lineOf = name => text.split('\n').find(l => l.includes(name));

  assert.ok(text.includes('프로젝트') && text.includes('E2E') && text.includes('Unit'), '헤더 누락');
  assert.ok(lineOf('ca-admin').includes('50/50') && lineOf('ca-admin').includes('118/120'), 'ca-admin 셀');
  assert.ok(lineOf('typist').includes('47/50'), 'typist e2e 셀');
  assert.ok(/\bUnit|·/.test('') || lineOf('typist').trim().endsWith('-'), 'typist unit 미등록은 -');
  assert.ok(lineOf('scm-front').includes('수집 실패'), 'scm-front unit 수집 실패');
  assert.ok(lineOf('cv-view').includes('결과 없음'), 'cv-view e2e 결과 없음');
  assert.ok(!text.includes('·'), '프로젝트 행에 소요시간 구분자(·)가 없어야 함');

  console.log('✅ buildProjectTableBlocks: 정렬/셀 규칙');
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: FAIL — `TypeError: buildProjectTableBlocks is not a function` (아직 export/구현 안 됨)

- [ ] **Step 3: 헬퍼 + `buildProjectTableBlocks` 구현**

`scripts/slack-notify.js`에서 `markdownText` 정의(현재 66–68행) **바로 아래**에 헬퍼 3개를 추가한다:

```js
function displayWidth(str) {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115F) ||  // Hangul Jamo
      (code >= 0x2300 && code <= 0x23FF) ||  // Misc Technical (⏸ 등)
      (code >= 0x2600 && code <= 0x27BF) ||  // Misc Symbols + Dingbats (✅ ❌ ⚠)
      (code >= 0x2E80 && code <= 0xA4CF) ||  // CJK 계열
      (code >= 0xAC00 && code <= 0xD7A3) ||  // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compatibility
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||  // Fullwidth
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x1F000);                     // Emoji/Symbols
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndW(text, width) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

function padStartW(text, width) {
  return ' '.repeat(Math.max(0, width - displayWidth(text))) + text;
}
```

그리고 기존 `buildIntegratedProjectFields` 함수(현재 91–127행) **전체를 삭제하고** 그 자리에 다음을 넣는다:

```js
function buildProjectTableBlocks(projects, e2eByProject, unitByProject, testsByProject) {
  const rows = projects.map(project => {
    const registered = (testsByProject && testsByProject[project]) || [];
    const e2e = e2eByProject.get(project);
    const unit = unitByProject.get(project);

    const e2eCell = !registered.includes('e2e') ? '-'
      : !e2e ? '결과 없음'
      : `${e2e.passed}/${e2e.total}`;
    const unitCell = !registered.includes('unit') ? '-'
      : !unit ? '결과 없음'
      : unit.status === 'error' ? '수집 실패'
      : `${unit.passed}/${unit.total}`;

    const overallFail =
      (registered.includes('e2e') && (!e2e || e2e.status === 'failed')) ||
      (registered.includes('unit') && (!unit || unit.status !== 'passed'));
    const icon = overallFail ? '❌' : (registered.length === 0 ? '⚠' : '✅');

    return { icon, name: project, e2e: e2eCell, unit: unitCell };
  });

  const nameW = Math.max(displayWidth('프로젝트'), ...rows.map(r => displayWidth(r.name)), 0);
  const e2eW = Math.max(displayWidth('E2E'), ...rows.map(r => displayWidth(r.e2e)), 0);
  const unitW = Math.max(displayWidth('Unit'), ...rows.map(r => displayWidth(r.unit)), 0);

  const GAP = '  ';
  const ICON_PAD = '   '; // 아이콘(폭2) + 공백 = 3, 헤더는 아이콘이 없으므로 공백 3개로 맞춤
  const header = ICON_PAD + padEndW('프로젝트', nameW) + GAP + padStartW('E2E', e2eW) + GAP + padStartW('Unit', unitW);
  const renderRow = r => `${r.icon} ` + padEndW(r.name, nameW) + GAP + padStartW(r.e2e, e2eW) + GAP + padStartW(r.unit, unitW);

  const CHUNK = 40; // Block Kit text 3000자 제한 보호 (40행 ≈ 1.7KB)
  const blocks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const table = [header, ...slice.map(renderRow)].join('\n');
    blocks.push({ type: 'section', text: markdownText('```\n' + table + '\n```') });
  }
  return blocks;
}
```

또한 `chunkFields` 함수(현재 129–135행)는 더 이상 쓰이지 않으므로 **전체 삭제**한다. (이 단계에서는 `buildSummaryMessage`가 아직 `chunkFields`를 참조하므로 Task 2에서 함께 교체된다. 순서상 Task 1 Step 3에서 `chunkFields`를 지우면 Task 2 전까지 `buildSummaryMessage` 실행이 깨질 수 있으니, **`chunkFields` 삭제는 Task 2 Step 2로 미룬다.** 이 Step에서는 헬퍼 3개 추가 + `buildIntegratedProjectFields`→`buildProjectTableBlocks` 교체까지만 한다.)

마지막으로 `module.exports`(현재 324–331행)에 `buildProjectTableBlocks`를 추가한다:

```js
module.exports = {
  buildProjectTableBlocks,
  buildSingleResultMessage,
  buildSummaryMessage,
  readProjectNames,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
};
```

- [ ] **Step 4: 테스트 실행하여 신규 테스트 통과 확인**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: 새 `✅ buildProjectTableBlocks: 정렬/셀 규칙` 로그가 출력된다.

주의: 이 시점에서 `buildSummaryMessage`는 `buildIntegratedProjectFields`(삭제됨)와 `chunkFields`를 참조하므로 **기존 테스트가 `ReferenceError`로 깨질 수 있다.** 이는 Task 2에서 해소된다. 만약 파일 실행이 신규 테스트 도달 전에 죽으면, 신규 테스트 블록을 임시로 파일 맨 위쪽(require 직후)으로 옮겨 단독 확인한 뒤 다시 끝으로 옮긴다. **이 단계에서는 신규 테스트가 통과한다는 것만 확인하면 된다.**

- [ ] **Step 5: 커밋하지 않음 — Task 2와 함께 커밋**

Task 2 완료 후 한 번에 커밋한다(중간 상태가 빨갛기 때문).

---

## Task 2: `buildSummaryMessage`를 테이블로 배선 + 깨진 기존 assertion 교체

**Files:**
- Modify: `scripts/slack-notify.js`
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: 깨질 기존 assertion을 테이블 포맷으로 먼저 교체 (TDD red)**

`scripts/__tests__/slack-notify.test.js`에서 다음 두 군데를 교체한다.

**(1)** 현재 121–126행:

```js
assertContainsField(payload, '*✅ ca-admin*');
assertContainsField(payload, 'E2E 50/50 · Unit - · 3분 42초');
assertContainsField(payload, '*❌ typist*');
assertContainsField(payload, 'E2E 47/50 · Unit - · 2분 10초');
assertContainsField(payload, '*❌ cv-view*');
assertContainsField(payload, 'E2E 결과 없음 · Unit - · -');
```

위를 다음으로 교체한다:

```js
const tableText1 = payload.blocks
  .filter(b => b.type === 'section' && b.text && typeof b.text.text === 'string' && b.text.text.startsWith('```'))
  .map(b => b.text.text).join('\n');
const lineOf1 = name => tableText1.split('\n').find(l => l.includes(name));
assert.ok(lineOf1('ca-admin').startsWith('✅') && lineOf1('ca-admin').includes('50/50'), 'ca-admin 행');
assert.ok(lineOf1('typist').startsWith('❌') && lineOf1('typist').includes('47/50'), 'typist 행');
assert.ok(lineOf1('cv-view').startsWith('❌') && lineOf1('cv-view').includes('결과 없음'), 'cv-view 행');
```

**(2)** 현재 216–229행(통합 시나리오의 summary/project 검사):

```js
  // 두 개의 Summary 섹션이 있어야 함 (E2E, Unit)
  const summaryTexts = message.blocks
    .filter(b => b.type === 'section' && Array.isArray(b.fields))
    .flatMap(b => b.fields.map(f => f.text));
  assert.ok(summaryTexts.some(t => t.includes('E2E') && t.includes('프로젝트 통과')), 'missing E2E summary');
  assert.ok(summaryTexts.some(t => t.includes('Unit') && t.includes('프로젝트 통과')), 'missing Unit summary');

  // 프로젝트 줄에 두 타입 모두 표기
  assert.ok(summaryTexts.some(t => t === 'E2E 19/21 · Unit 118/120 · 53초'),
    `ca-admin combined row missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E')).join(' | ')}`);

  // typist는 unit 미등록 → Unit -
  assert.ok(summaryTexts.some(t => t.includes('Unit -')),
    `typist Unit - missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E') || t.includes('typist')).join(' | ')}`);
```

위를 다음으로 교체한다:

```js
  // 집계 요약 섹션은 여전히 fields 로 존재 (E2E, Unit)
  const summaryTexts = message.blocks
    .filter(b => b.type === 'section' && Array.isArray(b.fields))
    .flatMap(b => b.fields.map(f => f.text));
  assert.ok(summaryTexts.some(t => t.includes('E2E') && t.includes('프로젝트 통과')), 'missing E2E summary');
  assert.ok(summaryTexts.some(t => t.includes('Unit') && t.includes('프로젝트 통과')), 'missing Unit summary');

  // 프로젝트 영역은 도표 테이블(코드블록)로 렌더
  const tableText = message.blocks
    .filter(b => b.type === 'section' && b.text && typeof b.text.text === 'string' && b.text.text.startsWith('```'))
    .map(b => b.text.text).join('\n');
  const lineOf = name => tableText.split('\n').find(l => l.includes(name));
  assert.ok(tableText.includes('프로젝트') && tableText.includes('E2E') && tableText.includes('Unit'), '테이블 헤더 누락');
  assert.ok(lineOf('ca-admin').includes('19/21') && lineOf('ca-admin').includes('118/120'),
    `ca-admin row missing. saw: ${lineOf('ca-admin')}`);
  // typist 는 unit 미등록 → Unit 셀이 '-'
  assert.ok(lineOf('typist').trim().endsWith('-'),
    `typist Unit - missing. saw: ${lineOf('typist')}`);
  assert.ok(!tableText.includes('·'), '프로젝트 행에 소요시간 구분자(·)가 없어야 함');
```

- [ ] **Step 2: `buildSummaryMessage` 배선 + `chunkFields` 삭제**

`scripts/slack-notify.js`의 `buildSummaryMessage` 안에서 현재 171행:

```js
  const projectFields = buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject);
```

을 다음으로 교체한다:

```js
  const projectBlocks = buildProjectTableBlocks(projects, e2eByProject, unitByProject, testsByProject);
```

이어서 `blocks` 배열(현재 179–193행)에서 다음 줄:

```js
    ...chunkFields(projectFields, 10).map(fields => ({ type: 'section', fields })),
```

을 다음으로 교체한다:

```js
    ...projectBlocks,
```

마지막으로 더 이상 참조되지 않는 `chunkFields` 함수(현재 129–135행)를 **전체 삭제**한다.

- [ ] **Step 3: 전체 테스트 실행하여 통과 확인**

Run: `node scripts/__tests__/slack-notify.test.js`
Expected: 모든 로그가 출력되고 마지막에 `✅ All slack-notify tests passed`, `✅ buildSummaryMessage: integrated e2e+unit`, `✅ slack summary: unit error/missing counts as failure`, `✅ buildProjectTableBlocks: 정렬/셀 규칙`가 모두 보인다. `ReferenceError`/`AssertionError` 없음.

- [ ] **Step 4: 나머지 스크립트 테스트도 회귀 확인**

Run:
```bash
for f in scripts/__tests__/*.test.js; do echo "== $f =="; node "$f" || exit 1; done
```
Expected: 모든 파일이 에러 없이 완료(각자의 `✅` 로그 출력).

- [ ] **Step 5: 커밋**

```bash
git add scripts/slack-notify.js scripts/__tests__/slack-notify.test.js
git commit -m "feat: Slack 프로젝트 결과를 프로젝트|E2E|Unit 도표 테이블로 분리"
```

---

## Task 3: 스펙 문서 갱신

**Files:**
- Modify: `docs/spec.md`

- [ ] **Step 1: "Slack 알림 형식" 4번 항목 교체**

`docs/spec.md`에서 현재 122–126행:

```
4. Project result fields (한 줄에 E2E · Unit 합산):
   - `✅ ca-admin` / `E2E 19/21 · Unit 118/120 · 41초`
   - `❌ partsfit-mall` / `E2E 69/160 · Unit - · 19초`
   - `⏸ project-c` / `E2E - · Unit 45/50 · 8초`
   - 등록되지 않은 테스트 타입은 `-`로 표시
```

을 다음으로 교체한다:

```
4. Project result table (monospace 코드블록, `프로젝트 | E2E | Unit` 3컬럼 정렬):

   ```
      프로젝트    E2E       Unit
   ✅ ca-admin    19/21     118/120
   ❌ partsfit-mall  69/160   -
   ⚠ project-c   -         45/50
   ```

   - 컬럼: 상태 아이콘 + 프로젝트명 / E2E 통과·전체 / Unit 통과·전체
   - 등록되지 않은 테스트 타입은 `-`, 결과 파일이 없으면 `결과 없음`, Unit 수집 실패는 `수집 실패`
   - 프로젝트별 소요시간은 표에 넣지 않고 상단 집계 요약의 `E2E 소요시간`/`Unit 소요시간`에만 표시
   - 프로젝트가 많으면 40행 단위로 코드블록을 분할(Block Kit 텍스트 3000자 제한 보호)
```

- [ ] **Step 2: 커밋**

```bash
git add docs/spec.md
git commit -m "docs: Slack 프로젝트 결과 도표 테이블 포맷 반영"
```

---

## Self-Review

**1. Spec coverage (요청: "e2e랑 유닛테스트 결과를 각각 나눠서"):** 사용자 확정 = 단일 메시지 유지 + 하단 프로젝트 영역을 `프로젝트 | E2E | Unit` 정렬 도표로 분리(선택한 preview), 헤더 문구 유지. → Task 1(테이블 빌더), Task 2(배선), Task 3(문서)로 커버. 집계 요약 섹션·대시보드 버튼·실패 상세 비포함 규칙은 변경 없음(기존 테스트 141–143행이 실패 상세 미포함을 계속 보증).

**2. Placeholder scan:** 모든 코드 단계에 실제 코드/정확한 행 번호/실행 명령·기대 출력 포함. TBD/“적절히 처리” 류 없음.

**3. Type consistency:** 신규 함수명 `buildProjectTableBlocks`는 구현(Task1 Step3)·export(Task1 Step3)·테스트 import(Task1 Step1)·`buildSummaryMessage` 호출부(Task2 Step2)에서 동일. 헬퍼명 `displayWidth`/`padEndW`/`padStartW` 일관. 정렬 핀 문자열은 실측으로 검증됨: `"```\n   프로젝트    E2E     Unit\n✅ ca-admin  19/21  118/120\n```"`.

**확정된 설계 결정(사용자 답변 기준):**
- 분리 방식: 별도 메시지 2개가 아니라 **단일 메시지 + 하단 프로젝트 도표 분리**.
- 렌더링: monospace 코드블록 정렬 테이블.
- 헤더: 기존 `테스트 전체 결과 · YYYY-MM-DD` 유지.
- 프로젝트별 소요시간 컬럼: preview에 없으므로 제거(집계 요약에만 유지).
