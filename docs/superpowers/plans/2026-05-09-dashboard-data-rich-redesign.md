# Dashboard Data-Rich Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright JSON 결과에서 추가 메타데이터(브라우저별 결과, 실패 step 흐름, flaky 테스트, 가장 느린 테스트, 30일 트렌드)를 추출해 대시보드에 시각화한다. 디자인은 [dashboard-preview.html](../../../dashboard-preview.html) 시안을 그대로 따른다.

**Architecture:** `parse-pw-results.js`를 확장해 Playwright의 `suites > specs > tests[].projectName/results/steps` 트리를 파싱하여 새 필드를 결과 JSON에 추가한다. 대시보드는 신규 atomic 컴포넌트(Sparkline, BrowserMatrix, StepTrail, FlakyList, SlowTestsList)를 추가하고, 기존 ProjectCard/FailureList/HistoryTable은 시안 layout으로 재구성한다. 30일 트렌드는 대시보드가 history results에서 클라이언트 측 계산. 폰트는 Pretendard(한글)+JetBrains Mono(숫자/코드)로 교체한다.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (기존), Pretendard Variable + JetBrains Mono (신규), 인라인 SVG (Sparkline)

**Design Reference:** [dashboard-preview.html](../../../dashboard-preview.html) — 정적 시안 (이미 사용자 승인). 디자인 토큰은 [DESIGN.md](../../../DESIGN.md) 기반으로 warning 색상만 추가.

---

## File Map

| 파일 | 역할 |
|------|------|
| `dashboard/package.json` | `pretendard`, `@fontsource-variable/jetbrains-mono` 의존성 추가 |
| `dashboard/src/index.css` | 폰트 import 교체, `--warning`, `--accent-muted` 등 CSS 변수 추가 |
| `dashboard/src/types.ts` | `BrowserStat`, `FlakyTest`, `SlowTest`, 확장된 `TestFailure`/`TestResult` |
| `dashboard/src/lib/trend.ts` | 30일 통과율 trend 배열 계산 헬퍼 |
| `dashboard/src/components/Sparkline.tsx` | SVG 라인 차트 (실패 dot + 마지막 dot) |
| `dashboard/src/components/BrowserMatrix.tsx` | 브라우저별 통과/실패 가로 행 |
| `dashboard/src/components/StepTrail.tsx` | step → step → ✕step 흐름 |
| `dashboard/src/components/FlakyList.tsx` | retry 후 통과한 테스트 목록 |
| `dashboard/src/components/SlowTestsList.tsx` | 가장 느린 테스트 막대 차트 |
| `dashboard/src/components/FailureList.tsx` | StepTrail + 스크린샷 placeholder + attachments 통합 |
| `dashboard/src/components/HistoryTable.tsx` | 통과율% 컬럼 + mini bar 추가 |
| `dashboard/src/components/ProjectCard.tsx` | 시안 카드 layout (Sparkline·Stats grid·BrowserMatrix·조건부 sections) |
| `dashboard/src/App.tsx` | 로고, summary bar에 flaky 추가, history → trend 변환 |
| `scripts/parse-pw-results.js` | browsers·flakyTests·slowTests·확장 failures 추출 |
| `scripts/__tests__/parse-pw-results.test.js` | 신규 출력 형식 검증 |
| `DESIGN.md` | 신규 위젯 토큰·스펙 추가 |

---

## Task 1: 폰트 패키지 설치 + CSS 토큰 확장

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/src/index.css`

- [ ] **Step 1: 폰트 패키지 설치**

```bash
cd dashboard
pnpm add pretendard @fontsource-variable/jetbrains-mono
cd ..
```

Expected: `package.json`에 두 패키지 추가됨, lockfile 업데이트.

- [ ] **Step 2: index.css 폰트 import 교체 + 새 CSS 변수 추가**

`dashboard/src/index.css` 상단 import 블록을 아래로 교체:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "pretendard/dist/web/variable/pretendardvariable.css";
@import "@fontsource-variable/jetbrains-mono";
```

(`@import "@fontsource-variable/geist";` 줄은 삭제 — 더 이상 사용하지 않음)

이어서 `:root` 블록 끝부분 (Border 변수 다음)에 아래 변수들을 추가:

```css
  /* Warning (flaky) */
  --warning: #f5a623;
  --warning-muted: rgba(245, 166, 35, 0.14);

  /* Accent muted (info) */
  --accent-muted: rgba(94, 106, 210, 0.15);
```

`:root`의 `font:` 라인을 아래로 교체 (Geist → Pretendard, mono fallback 추가):

```css
  font: 14px/1.5 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

`@theme inline { ... }` 블록의 `--font-sans`/`--font-heading`을 교체하고 `--font-mono` 추가:

```css
  --font-sans: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-heading: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
```

- [ ] **Step 3: 빌드 확인**

```bash
cd dashboard && pnpm build
```

Expected: TypeScript 에러 0, build 성공.

- [ ] **Step 4: 커밋**

```bash
git add dashboard/package.json dashboard/pnpm-lock.yaml dashboard/src/index.css
git commit -m "chore: Pretendard + JetBrains Mono 폰트 도입 및 CSS 토큰 확장"
```

---

## Task 2: parse-pw-results.js 데이터 확장 (TDD)

**Files:**
- Modify: `scripts/__tests__/parse-pw-results.test.js`
- Modify: `scripts/parse-pw-results.js`

- [ ] **Step 1: 확장된 mock과 검증 케이스를 테스트에 추가**

`scripts/__tests__/parse-pw-results.test.js` 전체를 아래로 교체:

```javascript
'use strict';
const assert = require('assert');
const { parsePlaywrightJSON } = require('../parse-pw-results');

// 기본 케이스: 단일 브라우저, 일부 실패 + flaky + steps
const mockPWOutput = {
  config: {
    projects: [
      { name: 'chromium' },
      { name: 'webkit' },
      { name: 'firefox' },
    ],
  },
  suites: [
    {
      title: 'checkout.spec.ts',
      file: 'checkout.spec.ts',
      specs: [
        {
          title: '결제 완료 플로우',
          line: 84,
          tests: [
            {
              projectName: 'webkit',
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  duration: 18700,
                  retry: 0,
                  error: { message: 'Expected visible' },
                  steps: [
                    { title: 'login' },
                    { title: 'navigate /cart' },
                    { title: 'click checkout' },
                    { title: 'fill card form' },
                    { title: 'click submit', error: { message: 'Expected visible' } },
                  ],
                  attachments: [
                    { name: 'screenshot', contentType: 'image/png', path: '/tmp/screenshot.png' },
                    { name: 'video',      contentType: 'video/webm', path: '/tmp/video.webm' },
                    { name: 'trace',      contentType: 'application/zip', path: '/tmp/trace.zip' },
                  ],
                },
              ],
            },
            {
              projectName: 'chromium',
              status: 'expected',
              results: [{ status: 'passed', duration: 4200, retry: 0, steps: [], attachments: [] }],
            },
            {
              projectName: 'firefox',
              status: 'expected',
              results: [{ status: 'passed', duration: 4100, retry: 0, steps: [], attachments: [] }],
            },
          ],
        },
        {
          title: '장바구니 추가',
          line: 10,
          tests: [
            {
              projectName: 'chromium',
              status: 'flaky',
              results: [
                { status: 'failed', duration: 1200, retry: 0, steps: [], attachments: [] },
                { status: 'passed', duration: 1100, retry: 1, steps: [], attachments: [] },
              ],
            },
            {
              projectName: 'webkit',
              status: 'expected',
              results: [{ status: 'passed', duration: 1300, retry: 0, steps: [], attachments: [] }],
            },
            {
              projectName: 'firefox',
              status: 'expected',
              results: [{ status: 'passed', duration: 1100, retry: 0, steps: [], attachments: [] }],
            },
          ],
        },
      ],
      suites: [],
    },
  ],
  stats: {
    startTime: '2026-05-09T10:00:00.000Z',
    duration: 222500,
    expected: 5,
    unexpected: 1,
    flaky: 1,
    skipped: 0,
  },
};

const result = parsePlaywrightJSON(mockPWOutput, 'ca-admin', '2026-05-09');

// === 기존 필드 (호환성) ===
assert.strictEqual(result.project, 'ca-admin', 'project');
assert.strictEqual(result.date, '2026-05-09', 'date');
assert.strictEqual(result.status, 'failed', 'status');
assert.strictEqual(result.total, 6, 'total = expected + unexpected + flaky + skipped');
assert.strictEqual(result.passed, 5, 'passed includes flaky-eventually-passed');
assert.strictEqual(result.failed, 1, 'failed = unexpected');
assert.strictEqual(result.flaky, 1, 'flaky count');
assert.strictEqual(result.duration, '3분 42초', 'duration format');

// === 확장 failures: browser, steps, failedStepIdx ===
assert.strictEqual(result.failures.length, 1, '1 failure (flaky는 제외)');
assert.strictEqual(result.failures[0].test, '결제 완료 플로우');
assert.strictEqual(result.failures[0].file, 'checkout.spec.ts');
assert.strictEqual(result.failures[0].line, 84);
assert.strictEqual(result.failures[0].error, 'Expected visible');
assert.strictEqual(result.failures[0].browser, 'webkit', 'browser from projectName');
assert.deepStrictEqual(
  result.failures[0].steps,
  ['login', 'navigate /cart', 'click checkout', 'fill card form', 'click submit'],
  'steps array'
);
assert.strictEqual(result.failures[0].failedStepIdx, 4, 'last failed step index');
assert.deepStrictEqual(
  result.failures[0].attachments.map(a => a.name),
  ['screenshot', 'video', 'trace'],
  'attachment names preserved'
);

// === Browsers 매트릭스 ===
assert.strictEqual(result.browsers.length, 3, '3 browsers');
const chromium = result.browsers.find(b => b.id === 'chromium');
assert.strictEqual(chromium.name, 'Chromium');
assert.strictEqual(chromium.icon, 'CR');
assert.strictEqual(chromium.passed, 2);
assert.strictEqual(chromium.failed, 0);
assert.strictEqual(chromium.total, 2);
const webkit = result.browsers.find(b => b.id === 'webkit');
assert.strictEqual(webkit.failed, 1, 'webkit had 1 unexpected');
assert.strictEqual(webkit.passed, 1);

// === Flaky tests ===
assert.strictEqual(result.flakyTests.length, 1);
assert.strictEqual(result.flakyTests[0].test, '장바구니 추가');
assert.strictEqual(result.flakyTests[0].file, 'checkout.spec.ts');
assert.strictEqual(result.flakyTests[0].line, 10);
assert.strictEqual(result.flakyTests[0].retries, 1, 'max retry count');

// === Slow tests Top 5 ===
assert.ok(result.slowTests.length >= 1 && result.slowTests.length <= 5);
assert.strictEqual(result.slowTests[0].test, '결제 완료 플로우', 'slowest first');
assert.strictEqual(result.slowTests[0].durationMs, 18700);
assert.strictEqual(result.slowTests[0].file, 'checkout.spec.ts');

// === 통과만 한 케이스 ===
const passed = parsePlaywrightJSON(
  {
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: { duration: 135000, expected: 50, unexpected: 0, flaky: 0, skipped: 0 },
  },
  'proj', '2026-05-09'
);
assert.strictEqual(passed.status, 'passed');
assert.strictEqual(passed.duration, '2분 15초');
assert.strictEqual(passed.failures.length, 0);
assert.strictEqual(passed.flakyTests.length, 0);
assert.strictEqual(passed.slowTests.length, 0);
assert.strictEqual(passed.browsers.length, 1);

console.log('✅ All parse-pw-results tests passed');
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node scripts/__tests__/parse-pw-results.test.js
```

Expected: AssertionError 또는 `result.flaky is undefined` 등으로 실패.

- [ ] **Step 3: parse-pw-results.js를 새 출력 형식에 맞게 재구현**

`scripts/parse-pw-results.js` 전체를 아래로 교체:

```javascript
#!/usr/bin/env node
'use strict';

const BROWSER_META = {
  chromium: { name: 'Chromium', icon: 'CR' },
  webkit:   { name: 'WebKit',   icon: 'WK' },
  firefox:  { name: 'Firefox',  icon: 'FF' },
};

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function browserMeta(id) {
  return BROWSER_META[id] || { name: id, icon: id.slice(0, 2).toUpperCase() };
}

function* iterSpecs(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      yield { suite, spec };
    }
    yield* iterSpecs(suite.suites);
  }
}

function lastFailedStepIdx(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] && steps[i].error) return i;
  }
  return steps.length - 1;
}

function collectFailures(suites) {
  const failures = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      if (test.status !== 'unexpected') continue;
      const failedResult = (test.results || []).find(r => r.status === 'failed') || {};
      const steps = (failedResult.steps || []).map(s => s.title);
      failures.push({
        test: spec.title,
        file: suite.file || suite.title,
        line: spec.line || 0,
        error: failedResult.error?.message || '',
        browser: test.projectName || '',
        steps,
        failedStepIdx: lastFailedStepIdx(failedResult.steps || []),
        attachments: (failedResult.attachments || []).map(a => ({
          name: a.name,
          contentType: a.contentType || '',
        })),
      });
    }
  }
  return failures;
}

function collectFlakyTests(suites) {
  const flaky = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      if (test.status !== 'flaky') continue;
      const retries = (test.results || []).reduce(
        (max, r) => Math.max(max, r.retry || 0), 0
      );
      flaky.push({
        test: spec.title,
        file: suite.file || suite.title,
        line: spec.line || 0,
        retries,
      });
    }
  }
  return flaky;
}

function collectSlowTests(suites, limit = 5) {
  const all = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      const lastResult = (test.results || []).slice(-1)[0];
      if (!lastResult) continue;
      all.push({
        test: spec.title,
        file: suite.file || suite.title,
        durationMs: lastResult.duration || 0,
      });
    }
  }
  return all.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

function collectBrowsers(raw) {
  const projectNames = (raw.config?.projects || []).map(p => p.name);
  const counts = {};
  for (const id of projectNames) {
    counts[id] = { id, ...browserMeta(id), passed: 0, failed: 0, total: 0 };
  }
  for (const { spec } of iterSpecs(raw.suites)) {
    for (const test of spec.tests || []) {
      const id = test.projectName || 'unknown';
      if (!counts[id]) counts[id] = { id, ...browserMeta(id), passed: 0, failed: 0, total: 0 };
      counts[id].total += 1;
      if (test.status === 'unexpected') counts[id].failed += 1;
      else counts[id].passed += 1;
    }
  }
  return Object.values(counts);
}

function parsePlaywrightJSON(raw, projectName, date) {
  const stats = raw.stats || {};
  const expected = stats.expected || 0;
  const unexpected = stats.unexpected || 0;
  const flaky = stats.flaky || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    date,
    status: unexpected > 0 ? 'failed' : 'passed',
    total: expected + unexpected + flaky + skipped,
    passed: expected + flaky,
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

if (require.main === module) {
  const [,, pwOutputFile, projectName, date] = process.argv;
  const raw = JSON.parse(require('fs').readFileSync(pwOutputFile, 'utf8'));
  console.log(JSON.stringify(parsePlaywrightJSON(raw, projectName, date), null, 2));
}

module.exports = { parsePlaywrightJSON };
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
node scripts/__tests__/parse-pw-results.test.js
```

Expected: `✅ All parse-pw-results tests passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/parse-pw-results.js scripts/__tests__/parse-pw-results.test.js
git commit -m "feat(parser): browsers/flaky/slow/steps 추출 및 attachment 메타 포함"
```

---

## Task 3: types.ts 확장

**Files:**
- Modify: `dashboard/src/types.ts`

- [ ] **Step 1: types.ts 전체 교체**

```typescript
export interface Manifest {
  projects: string[];
  lastUpdated: string;
}

export interface BrowserStat {
  id: string;
  name: string;
  icon: string;
  passed: number;
  failed: number;
  total: number;
}

export interface Attachment {
  name: string;
  contentType: string;
}

export interface TestFailure {
  test: string;
  file: string;
  line: number;
  error: string;
  browser: string;
  steps: string[];
  failedStepIdx: number;
  attachments: Attachment[];
}

export interface FlakyTest {
  test: string;
  file: string;
  line: number;
  retries: number;
}

export interface SlowTest {
  test: string;
  file: string;
  durationMs: number;
}

export interface TestResult {
  project: string;
  date: string;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration: string;
  browsers: BrowserStat[];
  failures: TestFailure[];
  flakyTests: FlakyTest[];
  slowTests: SlowTest[];
}
```

- [ ] **Step 2: 빌드 — 타입 에러로 기존 컴포넌트가 깨질 것을 확인**

```bash
cd dashboard && pnpm build
```

Expected: 기존 `FailureList.tsx`, `HistoryTable.tsx`, `ProjectCard.tsx`, mock fixtures 등에서 missing field 에러 발생. **이 시점 컴파일 실패는 정상이며, 후속 task에서 차례로 해결한다.**

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/types.ts
git commit -m "feat(types): TestResult에 browsers/flaky/steps/attachments 추가"
```

---

## Task 4: Sparkline 컴포넌트 (TDD)

**Files:**
- Create: `dashboard/src/components/__tests__/Sparkline.test.tsx`
- Create: `dashboard/src/components/Sparkline.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/Sparkline.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

it('renders an svg with polyline matching data length', () => {
  const { container } = render(<Sparkline data={[100, 95, 100, 90, 100]} accent="#27a644" />);
  const svg = container.querySelector('svg');
  expect(svg).toBeInTheDocument();
  const polyline = svg!.querySelector('polyline');
  expect(polyline).toBeInTheDocument();
  // 5 points → 4 commas
  expect(polyline!.getAttribute('points')!.split(' ')).toHaveLength(5);
});

it('marks failure dots for values < 100', () => {
  const { container } = render(<Sparkline data={[100, 90, 100, 95]} accent="#e5484d" />);
  // 2 failure dots (90, 95) + 1 last dot
  const circles = container.querySelectorAll('circle');
  expect(circles.length).toBe(3);
});

it('renders empty svg when data is empty', () => {
  const { container } = render(<Sparkline data={[]} accent="#27a644" />);
  expect(container.querySelector('polyline')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../Sparkline'`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/Sparkline.tsx`:

```tsx
interface Props {
  data: number[];
  accent: string;
  width?: number;
  height?: number;
}

export function Sparkline({ data, accent, width = 130, height = 24 }: Props) {
  if (data.length === 0) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }

  const max = 100;
  const min = Math.min(...data, 86);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const ys = data.map(v => height - ((v - min) / range) * (height - 6) - 3);
  const points = data.map((_, i) => `${(i * stepX).toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  const lastIdx = data.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = ys[lastIdx];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((v, i) =>
        v < 100 ? (
          <circle
            key={i}
            cx={(i * stepX).toFixed(1)}
            cy={ys[i].toFixed(1)}
            r={1.4}
            fill="var(--danger)"
            opacity={0.85}
          />
        ) : null
      )}
      <circle
        cx={lastX.toFixed(1)}
        cy={lastY.toFixed(1)}
        r={2.5}
        fill={accent}
        stroke="var(--surface-1)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 Sparkline tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/Sparkline.tsx dashboard/src/components/__tests__/Sparkline.test.tsx
git commit -m "feat(dashboard): Sparkline 컴포넌트 추가"
```

---

## Task 5: BrowserMatrix 컴포넌트 (TDD)

**Files:**
- Create: `dashboard/src/components/__tests__/BrowserMatrix.test.tsx`
- Create: `dashboard/src/components/BrowserMatrix.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/BrowserMatrix.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { BrowserMatrix } from '../BrowserMatrix';
import type { BrowserStat } from '../../types';

const browsers: BrowserStat[] = [
  { id: 'chromium', name: 'Chromium', icon: 'CR', passed: 28, failed: 1, total: 29 },
  { id: 'webkit',   name: 'WebKit',   icon: 'WK', passed: 27, failed: 2, total: 29 },
  { id: 'firefox',  name: 'Firefox',  icon: 'FF', passed: 29, failed: 0, total: 29 },
];

it('renders a row per browser with name and counts', () => {
  render(<BrowserMatrix browsers={browsers} />);
  expect(screen.getByText('Chromium')).toBeInTheDocument();
  expect(screen.getByText('WebKit')).toBeInTheDocument();
  expect(screen.getByText('Firefox')).toBeInTheDocument();
  expect(screen.getByText('28/29')).toBeInTheDocument();
  expect(screen.getByText('29/29')).toBeInTheDocument();
});

it('shows fail count when failures exist', () => {
  render(<BrowserMatrix browsers={browsers} />);
  expect(screen.getByText(/2 실패/)).toBeInTheDocument();
});

it('renders nothing when browsers is empty', () => {
  const { container } = render(<BrowserMatrix browsers={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../BrowserMatrix'`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/BrowserMatrix.tsx`:

```tsx
import type { BrowserStat } from '../types';

interface Props {
  browsers: BrowserStat[];
}

export function BrowserMatrix({ browsers }: Props) {
  if (browsers.length === 0) return null;

  return (
    <div
      style={{
        padding: '14px 22px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 18,
        fontSize: 12,
      }}
    >
      <div
        style={{
          color: 'var(--text-faint)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          fontWeight: 500,
          marginRight: 4,
        }}
      >
        브라우저
      </div>
      {browsers.map(b => (
        <BrowserRow key={b.id} browser={b} />
      ))}
    </div>
  );
}

function BrowserRow({ browser }: { browser: BrowserStat }) {
  const failed = browser.failed > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: failed ? 'var(--danger-muted)' : 'var(--success-muted)',
          color: failed ? 'var(--danger)' : 'var(--success)',
          boxShadow: `inset 0 0 0 1px ${failed ? 'rgba(229,72,77,0.2)' : 'rgba(39,166,68,0.2)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {browser.icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {browser.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--text-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {browser.passed}/{browser.total}
          {browser.failed > 0 && (
            <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
              {' '}· {browser.failed} 실패
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 BrowserMatrix tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/BrowserMatrix.tsx dashboard/src/components/__tests__/BrowserMatrix.test.tsx
git commit -m "feat(dashboard): BrowserMatrix 컴포넌트 추가"
```

---

## Task 6: StepTrail 컴포넌트 (TDD)

**Files:**
- Create: `dashboard/src/components/__tests__/StepTrail.test.tsx`
- Create: `dashboard/src/components/StepTrail.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/StepTrail.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { StepTrail } from '../StepTrail';

it('renders all steps with arrows between them', () => {
  render(<StepTrail steps={['login', 'navigate', 'click submit']} failedStepIdx={2} />);
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
  // 2 arrows for 3 steps
  expect(screen.getAllByText('→')).toHaveLength(2);
});

it('handles no failed step (failedStepIdx = -1)', () => {
  render(<StepTrail steps={['a', 'b']} failedStepIdx={-1} />);
  expect(screen.getByText('a')).toBeInTheDocument();
  expect(screen.queryByText(/✕/)).not.toBeInTheDocument();
});

it('renders nothing when steps is empty', () => {
  const { container } = render(<StepTrail steps={[]} failedStepIdx={-1} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../StepTrail'`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/StepTrail.tsx`:

```tsx
interface Props {
  steps: string[];
  failedStepIdx: number;
}

export function StepTrail({ steps, failedStepIdx }: Props) {
  if (steps.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        marginTop: 9,
        paddingLeft: 24,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      {steps.map((step, i) => {
        const failed = i === failedStepIdx;
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                background: failed ? 'var(--danger-muted)' : 'var(--surface-2)',
                color: failed ? 'var(--danger)' : 'var(--text-muted)',
                padding: '3px 9px',
                borderRadius: 4,
                letterSpacing: '-0.01em',
                fontWeight: failed ? 500 : 400,
                boxShadow: failed ? '0 0 0 1px rgba(229,72,77,0.2)' : undefined,
              }}
            >
              {failed ? '✕ ' : ''}{step}
            </span>
            {i < steps.length - 1 && (
              <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>→</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 StepTrail tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/StepTrail.tsx dashboard/src/components/__tests__/StepTrail.test.tsx
git commit -m "feat(dashboard): StepTrail 컴포넌트 추가"
```

---

## Task 7: FlakyList 컴포넌트 (TDD)

**Files:**
- Create: `dashboard/src/components/__tests__/FlakyList.test.tsx`
- Create: `dashboard/src/components/FlakyList.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/FlakyList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { FlakyList } from '../FlakyList';
import type { FlakyTest } from '../../types';

const tests: FlakyTest[] = [
  { test: '로그인 후 토큰 갱신', file: 'auth.spec.ts', line: 28, retries: 1 },
  { test: '실시간 알림 수신', file: 'notifications.spec.ts', line: 67, retries: 2 },
];

it('renders test names and retry counts', () => {
  render(<FlakyList tests={tests} />);
  expect(screen.getByText('로그인 후 토큰 갱신')).toBeInTheDocument();
  expect(screen.getByText('실시간 알림 수신')).toBeInTheDocument();
  expect(screen.getByText(/retry 1회 후 통과/)).toBeInTheDocument();
  expect(screen.getByText(/retry 2회 후 통과/)).toBeInTheDocument();
});

it('shows file location', () => {
  render(<FlakyList tests={tests} />);
  expect(screen.getByText('auth.spec.ts:28')).toBeInTheDocument();
});

it('renders nothing when empty', () => {
  const { container } = render(<FlakyList tests={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../FlakyList'`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/FlakyList.tsx`:

```tsx
import type { FlakyTest } from '../types';

interface Props {
  tests: FlakyTest[];
}

export function FlakyList({ tests }: Props) {
  if (tests.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {tests.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 12px',
            borderRadius: 6,
            background: 'rgba(245, 166, 35, 0.05)',
            border: '1px solid rgba(245, 166, 35, 0.13)',
          }}
        >
          <span style={{ color: 'var(--warning)', fontSize: 13, width: 14, textAlign: 'center' }}>⚡</span>
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>
            {t.test}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-faint)',
            }}
          >
            {t.file}:{t.line}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--warning)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              background: 'var(--warning-muted)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            retry {t.retries}회 후 통과
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 FlakyList tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/FlakyList.tsx dashboard/src/components/__tests__/FlakyList.test.tsx
git commit -m "feat(dashboard): FlakyList 컴포넌트 추가"
```

---

## Task 8: SlowTestsList 컴포넌트 (TDD)

**Files:**
- Create: `dashboard/src/components/__tests__/SlowTestsList.test.tsx`
- Create: `dashboard/src/components/SlowTestsList.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/SlowTestsList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { SlowTestsList } from '../SlowTestsList';
import type { SlowTest } from '../../types';

const tests: SlowTest[] = [
  { test: '대규모 데이터 임포트', file: 'import.spec.ts', durationMs: 28400 },
  { test: '리포트 PDF 생성', file: 'reports.spec.ts', durationMs: 22100 },
  { test: '결제 완료 플로우', file: 'checkout.spec.ts', durationMs: 18700 },
];

it('renders test name, file, and duration in seconds', () => {
  render(<SlowTestsList tests={tests} />);
  expect(screen.getByText('대규모 데이터 임포트')).toBeInTheDocument();
  expect(screen.getByText('· import.spec.ts')).toBeInTheDocument();
  expect(screen.getByText('28.4s')).toBeInTheDocument();
  expect(screen.getByText('22.1s')).toBeInTheDocument();
});

it('renders 1-based rank prefix', () => {
  render(<SlowTestsList tests={tests} />);
  expect(screen.getByText('01')).toBeInTheDocument();
  expect(screen.getByText('02')).toBeInTheDocument();
  expect(screen.getByText('03')).toBeInTheDocument();
});

it('renders nothing when empty', () => {
  const { container } = render(<SlowTestsList tests={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../SlowTestsList'`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/SlowTestsList.tsx`:

```tsx
import type { SlowTest } from '../types';

interface Props {
  tests: SlowTest[];
}

export function SlowTestsList({ tests }: Props) {
  if (tests.length === 0) return null;
  const maxMs = Math.max(...tests.map(t => t.durationMs), 1);

  return (
    <div
      style={{
        padding: '4px 22px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {tests.map((t, i) => {
        const pct = (t.durationMs / maxMs) * 100;
        const sec = (t.durationMs / 1000).toFixed(1);
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '320px 1fr 60px',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'baseline',
                gap: 7,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--text-faint)',
                  marginRight: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {t.test}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--text-faint)',
                }}
              >
                · {t.file}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--surface-3)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct.toFixed(1)}%`,
                  background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)',
                  borderRadius: 3,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}
            >
              {sec}s
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 SlowTestsList tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/SlowTestsList.tsx dashboard/src/components/__tests__/SlowTestsList.test.tsx
git commit -m "feat(dashboard): SlowTestsList 컴포넌트 추가"
```

---

## Task 9: FailureList 업데이트 — StepTrail + 스크린샷 + attachments

**Files:**
- Modify: `dashboard/src/components/__tests__/FailureList.test.tsx`
- Modify: `dashboard/src/components/FailureList.tsx`

- [ ] **Step 1: 기존 테스트를 새 인터페이스로 교체**

`dashboard/src/components/__tests__/FailureList.test.tsx` 전체 교체:

```tsx
import { render, screen } from '@testing-library/react';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  {
    test: '결제 완료 플로우',
    file: 'checkout.spec.ts',
    line: 84,
    error: 'Expected visible',
    browser: 'webkit',
    steps: ['login', 'navigate /cart', 'click submit'],
    failedStepIdx: 2,
    attachments: [
      { name: 'screenshot', contentType: 'image/png' },
      { name: 'trace', contentType: 'application/zip' },
    ],
  },
];

it('renders failure title, file:line, error, and browser tag', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('checkout.spec.ts:84')).toBeInTheDocument();
  expect(screen.getByText('Expected visible')).toBeInTheDocument();
  expect(screen.getByText('webkit')).toBeInTheDocument();
});

it('renders step trail with failed step marker', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate /cart')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
});

it('renders attachment chips for each attachment', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText(/screenshot/)).toBeInTheDocument();
  expect(screen.getByText(/trace/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: 기존 FailureList 컴포넌트는 새 props(`browser`, `steps`, …)와 매칭 안 되어 실패.

- [ ] **Step 3: FailureList.tsx 전체 교체**

```tsx
import type { TestFailure } from '../types';
import { StepTrail } from './StepTrail';

interface Props {
  failures: TestFailure[];
}

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {failures.map((f, i) => (
        <FailureItem key={i} failure={f} />
      ))}
    </div>
  );
}

function FailureItem({ failure: f }: { failure: TestFailure }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 8,
        background: 'rgba(229, 72, 77, 0.04)',
        border: '1px solid rgba(229, 72, 77, 0.13)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 13, width: 14, textAlign: 'center' }}>
          ✕
        </span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>
          {f.test}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>
          {f.file}:{f.line}
        </div>
        <div
          style={{
            background: 'var(--surface-3)',
            color: 'var(--text-secondary)',
            padding: '2px 8px',
            fontSize: 10,
            borderRadius: 999,
            fontWeight: 500,
            letterSpacing: '0.04em',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {f.browser}
        </div>
      </div>

      <StepTrail steps={f.steps} failedStepIdx={f.failedStepIdx} />

      <div
        style={{
          marginTop: 12,
          marginLeft: 24,
          display: 'grid',
          gridTemplateColumns: '132px 1fr',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <ScreenshotPlaceholder />
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            padding: '8px 10px',
            background: 'var(--surface-2)',
            borderRadius: 4,
            borderLeft: '2px solid var(--danger)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.55,
            letterSpacing: '-0.01em',
            overflow: 'auto',
            maxHeight: 100,
            margin: 0,
          }}
        >
          {f.error}
        </pre>
      </div>

      {f.attachments.length > 0 && (
        <div
          style={{
            marginTop: 10,
            marginLeft: 24,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {f.attachments.map((a, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--accent-hover)',
                padding: '4px 9px',
                borderRadius: 4,
                background: 'rgba(94,106,210,0.08)',
                border: '1px solid rgba(94,106,210,0.14)',
              }}
            >
              {iconFor(a.name)} {a.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScreenshotPlaceholder() {
  return (
    <div
      style={{
        borderRadius: 5,
        background: [
          'radial-gradient(at 30% 30%, rgba(94,106,210,0.15), transparent 60%)',
          'radial-gradient(at 70% 70%, rgba(229,72,77,0.12), transparent 60%)',
          'linear-gradient(135deg, #2a2b35 0%, #1a1b22 100%)',
        ].join(', '),
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: '16 / 10',
      }}
    >
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          right: 8,
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          background: 'rgba(0,0,0,0.55)',
          padding: '1px 6px',
          borderRadius: 3,
          letterSpacing: '0.02em',
        }}
      >
        📷 screenshot
      </span>
    </div>
  );
}

function iconFor(name: string): string {
  if (name.includes('screenshot') || name.includes('image')) return '📷';
  if (name.includes('video')) return '🎬';
  if (name.includes('trace')) return '🔍';
  return '📎';
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 4 FailureList tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/FailureList.tsx dashboard/src/components/__tests__/FailureList.test.tsx
git commit -m "feat(dashboard): FailureList에 StepTrail/스크린샷/attachments 통합"
```

---

## Task 10: HistoryTable 업데이트 — 통과율 mini bar 컬럼

**Files:**
- Modify: `dashboard/src/components/__tests__/HistoryTable.test.tsx`
- Modify: `dashboard/src/components/HistoryTable.tsx`

- [ ] **Step 1: 기존 테스트 교체 (TestResult 새 필드 포함)**

`dashboard/src/components/__tests__/HistoryTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { HistoryTable } from '../HistoryTable';
import type { TestResult } from '../../types';

const base: Omit<TestResult, 'date' | 'status' | 'failed' | 'passed' | 'duration'> = {
  project: 'ca-admin',
  total: 50,
  flaky: 0,
  skipped: 0,
  browsers: [],
  failures: [],
  flakyTests: [],
  slowTests: [],
};

const results: TestResult[] = [
  { ...base, date: '2026-05-08', status: 'failed', passed: 47, failed: 3, duration: '3분 42초' },
  { ...base, date: '2026-05-07', status: 'passed', passed: 50, failed: 0, duration: '2분 15초' },
];

it('renders a row per result plus header', () => {
  render(<HistoryTable results={results} />);
  expect(screen.getAllByRole('row')).toHaveLength(3);
});

it('shows date, duration, status text', () => {
  render(<HistoryTable results={results} />);
  expect(screen.getByText('2026-05-08')).toBeInTheDocument();
  expect(screen.getByText('3분 42초')).toBeInTheDocument();
  expect(screen.getByText('실패')).toBeInTheDocument();
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('shows pass rate percentage', () => {
  render(<HistoryTable results={results} />);
  // 47/50 = 94%
  expect(screen.getByText('94%')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
});

it('renders empty state when no results', () => {
  render(<HistoryTable results={[]} />);
  expect(screen.getByText('실행 기록 없음')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: pass rate% 검증 실패 (`94%` 못 찾음).

- [ ] **Step 3: HistoryTable.tsx 전체 교체**

```tsx
import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return (
      <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
        실행 기록 없음
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {['날짜', '상태', '통과', '실패', '소요시간', '통과율'].map(h => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '8px 0',
                fontWeight: 500,
                color: 'var(--text-faint)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map(r => {
          const rate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
          const failColor = r.failed > 0 ? 'var(--danger)' : 'var(--text-faint)';
          return (
            <tr key={r.date} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={cellStyle({ color: 'var(--text-secondary)' })}>{r.date}</td>
              <td
                style={cellStyle({
                  color: r.status === 'passed' ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 500,
                })}
              >
                {r.status === 'passed' ? '통과' : '실패'}
              </td>
              <td style={cellStyle({ color: 'var(--text-secondary)' })}>{r.passed}</td>
              <td style={cellStyle({ color: failColor, fontWeight: r.failed > 0 ? 500 : 400 })}>{r.failed}</td>
              <td style={cellStyle({ color: 'var(--text-faint)' })}>{r.duration}</td>
              <td style={cellStyle({})}>
                <MiniBar rate={rate} failed={r.failed > 0} />
                <span style={{ color: failColor, fontSize: 10.5 }}>{rate}%</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function cellStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    padding: '8px 0',
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 11.5,
    ...extra,
  };
}

function MiniBar({ rate, failed }: { rate: number; failed: boolean }) {
  return (
    <span
      style={{
        width: 56,
        height: 4,
        background: 'var(--surface-3)',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: 8,
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${rate}%`,
          background: failed ? 'var(--danger)' : 'var(--success)',
        }}
      />
    </span>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 4 HistoryTable tests pass.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/HistoryTable.tsx dashboard/src/components/__tests__/HistoryTable.test.tsx
git commit -m "feat(dashboard): HistoryTable에 통과율% + mini bar 컬럼 추가"
```

---

## Task 11: ProjectCard 통합 (TDD)

**Files:**
- Modify: `dashboard/src/components/__tests__/ProjectCard.test.tsx`
- Modify: `dashboard/src/components/ProjectCard.tsx`

- [ ] **Step 1: 테스트 교체**

`dashboard/src/components/__tests__/ProjectCard.test.tsx` 전체 교체:

```tsx
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '../ProjectCard';
import type { TestResult } from '../../types';

const failedResult: TestResult = {
  project: 'ca-admin',
  date: '2026-05-09',
  status: 'failed',
  total: 87,
  passed: 82,
  failed: 3,
  flaky: 2,
  skipped: 0,
  duration: '5분 23초',
  browsers: [
    { id: 'chromium', name: 'Chromium', icon: 'CR', passed: 28, failed: 1, total: 29 },
  ],
  failures: [
    {
      test: '결제 완료 플로우',
      file: 'checkout.spec.ts',
      line: 84,
      error: 'err',
      browser: 'webkit',
      steps: ['a', 'b'],
      failedStepIdx: 1,
      attachments: [],
    },
  ],
  flakyTests: [{ test: '토큰 갱신', file: 'auth.spec.ts', line: 28, retries: 1 }],
  slowTests: [{ test: '느린 임포트', file: 'import.spec.ts', durationMs: 22000 }],
};

const passedResult: TestResult = {
  ...failedResult,
  status: 'passed',
  passed: 87,
  failed: 0,
  flaky: 0,
  failures: [],
  flakyTests: [],
};

it('displays project name and status badge', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100, 95]} />);
  expect(screen.getByText('ca-admin')).toBeInTheDocument();
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('shows pass rate, failed count, flaky count', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100]} />);
  // 82/87 = 94.25 → rounded 94
  expect(screen.getByText('94')).toBeInTheDocument();
  expect(screen.getByText('% · 82/87')).toBeInTheDocument();
  // 실패 3건, flaky 2건
  expect(screen.getByText('5분 23초')).toBeInTheDocument();
});

it('shows 통과 badge and hides failure section when passed', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} trend={[100]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
  expect(screen.queryByText('실패 상세')).not.toBeInTheDocument();
});

it('renders 데이터 없음 when latest is null', () => {
  render(<ProjectCard projectName="ca-admin" latest={null} history={[]} trend={[]} />);
  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
});

it('shows failure section, flaky section, slow section for failed result', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100]} />);
  expect(screen.getByText('실패 상세')).toBeInTheDocument();
  expect(screen.getByText(/Flaky 테스트/)).toBeInTheDocument();
  expect(screen.getByText('가장 느린 테스트')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: ProjectCard에 `trend` prop 없음 + 새 섹션 텍스트 없음으로 실패.

- [ ] **Step 3: ProjectCard.tsx 전체 교체**

```tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { TestResult } from '../types';
import { Sparkline } from './Sparkline';
import { BrowserMatrix } from './BrowserMatrix';
import { FailureList } from './FailureList';
import { FlakyList } from './FlakyList';
import { SlowTestsList } from './SlowTestsList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
  trend: number[];
}

export function ProjectCard({ projectName, latest, history, trend }: Props) {
  const passRate = latest && latest.total > 0 ? (latest.passed / latest.total) * 100 : 0;
  const passRateInt = Math.round(passRate);
  const statusKey: 'failed' | 'passed' | 'no-data' = !latest
    ? 'no-data'
    : latest.failed > 0
      ? 'failed'
      : 'passed';
  const accent =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--surface-4)';

  return (
    <article
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${accent}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <CardHeader projectName={projectName} latest={latest} statusKey={statusKey} trend={trend} accent={accent} />

      {latest && <Stats latest={latest} passRate={passRate} passRateInt={passRateInt} />}

      {latest && <BrowserMatrix browsers={latest.browsers} />}

      {latest && latest.failures.length > 0 && (
        <Section title="실패 상세" count={`${latest.failures.length}건`} variant="danger">
          <FailureList failures={latest.failures} />
        </Section>
      )}

      {latest && latest.flakyTests.length > 0 && (
        <Section title="Flaky 테스트 — 재시도 후 통과" count={`${latest.flakyTests.length}건`} variant="warning">
          <FlakyList tests={latest.flakyTests} />
        </Section>
      )}

      {latest && latest.slowTests.length > 0 && (
        <Section title="가장 느린 테스트" count={`Top ${latest.slowTests.length}`} variant="default">
          <SlowTestsList tests={latest.slowTests} />
        </Section>
      )}

      {history.length > 0 && <HistoryToggle history={history} />}
    </article>
  );
}

function CardHeader({
  projectName,
  latest,
  statusKey,
  trend,
  accent,
}: {
  projectName: string;
  latest: TestResult | null;
  statusKey: 'failed' | 'passed' | 'no-data';
  trend: number[];
  accent: string;
}) {
  const badgeText = statusKey === 'failed' ? '실패' : statusKey === 'passed' ? '통과' : '데이터 없음';
  const badgeBg =
    statusKey === 'failed' ? 'var(--danger-muted)' : statusKey === 'passed' ? 'var(--success-muted)' : 'var(--surface-3)';
  const badgeFg =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px 4px' }}>
      <div
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.014em',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        {projectName}
        {latest && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 400,
            }}
          >
            · {latest.date}
          </span>
        )}
      </div>
      {trend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Sparkline data={trend} accent={accent} />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--text-faint)',
              letterSpacing: '0.02em',
            }}
          >
            최근 {trend.length}일 통과율
          </div>
        </div>
      )}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: '3px 10px',
          borderRadius: 999,
          letterSpacing: '0.02em',
          background: badgeBg,
          color: badgeFg,
        }}
      >
        {badgeText}
      </span>
    </div>
  );
}

function Stats({
  latest,
  passRate,
  passRateInt,
}: {
  latest: TestResult;
  passRate: number;
  passRateInt: number;
}) {
  const progressColor = latest.failed > 0 ? 'var(--danger)' : 'var(--success)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
        gap: 26,
        padding: '14px 22px 18px',
      }}
    >
      <div>
        <Label>통과율</Label>
        <Value>
          {passRateInt}
          <Sub>% · {latest.passed}/{latest.total}</Sub>
        </Value>
        <div
          style={{
            marginTop: 10,
            height: 4,
            background: 'var(--surface-3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${passRate}%`,
              background: progressColor,
              borderRadius: 2,
              transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          />
        </div>
      </div>
      <div>
        <Label>실행 시간</Label>
        <Value>{latest.duration}</Value>
      </div>
      <div>
        <Label>실패</Label>
        <Value tone={latest.failed > 0 ? 'danger' : 'muted'}>
          {latest.failed}
          <Sub>건</Sub>
        </Value>
      </div>
      <div>
        <Label>Flaky</Label>
        <Value tone={latest.flaky > 0 ? 'warning' : 'muted'}>
          {latest.flaky}
          <Sub>건</Sub>
        </Value>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: 'var(--text-faint)',
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        fontWeight: 500,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Value({ children, tone }: { children: React.ReactNode; tone?: 'danger' | 'warning' | 'muted' }) {
  const color =
    tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : tone === 'muted' ? 'var(--text-faint)' : 'var(--text-primary)';
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 22,
        fontWeight: 500,
        color,
        letterSpacing: '-0.025em',
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        lineHeight: 1.1,
      }}
    >
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0 }}>
      {children}
    </span>
  );
}

function Section({
  title,
  count,
  variant,
  children,
}: {
  title: string;
  count: string;
  variant: 'danger' | 'warning' | 'default';
  children: React.ReactNode;
}) {
  const countBg =
    variant === 'danger' ? 'var(--danger-muted)' : variant === 'warning' ? 'var(--warning-muted)' : 'var(--surface-3)';
  const countFg =
    variant === 'danger' ? 'var(--danger)' : variant === 'warning' ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div
        style={{
          padding: '14px 22px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-faint)',
          fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            background: countBg,
            color: countFg,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10.5,
            letterSpacing: 0,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function HistoryToggle({ history }: { history: TestResult[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--text-muted)',
          background: 'transparent',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span>30일 히스토리 — {history.length}건</span>
        <ChevronDown
          style={{
            width: 14,
            height: 14,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 22px 18px' }}>
          <HistoryTable results={history} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 5 ProjectCard tests pass + 모든 다른 테스트 그대로 통과.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/ProjectCard.tsx dashboard/src/components/__tests__/ProjectCard.test.tsx
git commit -m "feat(dashboard): ProjectCard 시안 layout 적용 (sparkline·matrix·flaky·slow)"
```

---

## Task 12: trend 헬퍼 + App.tsx 업데이트

**Files:**
- Create: `dashboard/src/lib/trend.ts`
- Create: `dashboard/src/__tests__/trend.test.ts`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: trend 헬퍼 테스트 작성**

`dashboard/src/__tests__/trend.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeTrend } from '../lib/trend';
import type { TestResult } from '../types';

const mk = (date: string, passed: number, total: number): TestResult => ({
  project: 'p', date, status: passed === total ? 'passed' : 'failed',
  total, passed, failed: total - passed, flaky: 0, skipped: 0, duration: '0초',
  browsers: [], failures: [], flakyTests: [], slowTests: [],
});

describe('computeTrend', () => {
  it('returns pass-rate percentages in chronological order (oldest first)', () => {
    const r = computeTrend([
      mk('2026-05-09', 9, 10),  // newest first in input
      mk('2026-05-08', 10, 10),
      mk('2026-05-07', 8, 10),
    ]);
    expect(r).toEqual([80, 100, 90]);
  });

  it('returns empty array when no results', () => {
    expect(computeTrend([])).toEqual([]);
  });

  it('handles total=0 as 100', () => {
    expect(computeTrend([mk('2026-05-09', 0, 0)])).toEqual([100]);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../lib/trend'`

- [ ] **Step 3: lib/trend.ts 작성**

`dashboard/src/lib/trend.ts`:

```typescript
import type { TestResult } from '../types';

/**
 * 통과율(%) 배열을 시간 오름차순(오래된 → 최신)으로 반환.
 * 결과가 없는 날은 건너뛰고, 결과가 있는 날만 점으로 표시한다.
 */
export function computeTrend(results: TestResult[]): number[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => (r.total > 0 ? Math.round((r.passed / r.total) * 100) : 100));
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 trend tests pass.

- [ ] **Step 5: App.tsx 전체 교체 (헤더 + summary bar에 flaky 추가 + trend 통합)**

`dashboard/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { fetchManifest, fetchResult, last30Days } from './api';
import { ProjectCard } from './components/ProjectCard';
import { computeTrend } from './lib/trend';
import type { TestResult } from './types';

interface ProjectData {
  name: string;
  latest: TestResult | null;
  history: TestResult[];
  trend: number[];
}

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const manifest = await fetchManifest();
        setLastUpdated(manifest.lastUpdated);

        const days = last30Days();
        const projectData = await Promise.all(
          manifest.projects.map(async name => {
            const results = (
              await Promise.all(days.map(date => fetchResult(name, date)))
            ).filter((r): r is TestResult => r !== null);

            return {
              name,
              latest: results[0] ?? null,
              history: results,
              trend: computeTrend(results),
            };
          })
        );
        setProjects(projectData);
      } catch {
        setError('결과를 불러오지 못했습니다. Docker 컨테이너가 실행 중인지 확인하세요.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  const passedCount = projects.filter(p => p.latest && p.latest.failed === 0).length;
  const failedCount = projects.filter(p => p.latest && p.latest.failed > 0).length;
  const flakyTotal = projects.reduce((sum, p) => sum + (p.latest?.flaky || 0), 0);
  const totalTests = projects.reduce((sum, p) => sum + (p.latest?.total || 0), 0);
  const failedTests = projects.reduce((sum, p) => sum + (p.latest?.failed || 0), 0);
  const passRate = totalTests > 0 ? Math.round(((totalTests - failedTests) / totalTests) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#010102' }}>
      <Header lastUpdated={lastUpdated} />

      {projects.length > 0 && (
        <SummaryBar
          projectCount={projects.length}
          passedCount={passedCount}
          failedCount={failedCount}
          flakyTotal={flakyTotal}
          passRate={passRate}
          totalTests={totalTests}
          failedTests={failedTests}
        />
      )}

      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '22px 24px 60px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {error && (
          <div
            style={{
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              border: '1px solid rgba(229,72,77,0.2)',
            }}
          >
            {error}
          </div>
        )}
        {projects.length === 0 && !error ? (
          <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            등록된 프로젝트가 없습니다.
          </p>
        ) : (
          projects.map(p => (
            <ProjectCard
              key={p.name}
              projectName={p.name}
              latest={p.latest}
              history={p.history}
              trend={p.trend}
            />
          ))
        )}
      </main>
    </div>
  );
}

function Header({ lastUpdated }: { lastUpdated: string }) {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background:
          'linear-gradient(180deg, rgba(94,106,210,0.05) 0%, transparent 100%), var(--surface-1)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'saturate(150%) blur(8px)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '13px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, letterSpacing: '-0.012em' }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'white',
              boxShadow: '0 0 0 1px rgba(94,106,210,0.25), 0 4px 14px rgba(94,106,210,0.25)',
            }}
          >
            E
          </div>
          <span>E2E 테스트 대시보드</span>
        </div>
        {lastUpdated && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            마지막 실행 ·{' '}
            {new Date(lastUpdated).toLocaleString('ko-KR', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </header>
  );
}

function SummaryBar({
  projectCount,
  passedCount,
  failedCount,
  flakyTotal,
  passRate,
  totalTests,
  failedTests,
}: {
  projectCount: number;
  passedCount: number;
  failedCount: number;
  flakyTotal: number;
  passRate: number;
  totalTests: number;
  failedTests: number;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '11px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <Stat>
          <span style={statValueStyle}>{projectCount}</span>개 프로젝트
        </Stat>
        <Divider />
        <Stat>
          <Dot color="var(--success)" />
          <span style={statValueStyle}>{passedCount}</span>통과
        </Stat>
        <Stat>
          <Dot color="var(--danger)" />
          <span style={statValueStyle}>{failedCount}</span>실패
        </Stat>
        {flakyTotal > 0 && (
          <Stat>
            <Dot color="var(--warning)" />
            <span style={statValueStyle}>{flakyTotal}</span>flaky
          </Stat>
        )}
        <Divider />
        <Stat>
          전체 통과율
          <span style={statValueStyle}>{passRate}%</span>
          <span style={statValueStyle}>{totalTests - failedTests}/{totalTests}</span>
        </Stat>
      </div>
    </div>
  );
}

const statValueStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
  marginRight: 1,
  marginLeft: 4,
};

function Stat({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{children}</div>;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

function Divider() {
  return <span style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />;
}
```

- [ ] **Step 6: 빌드 + 모든 테스트 통과 확인**

```bash
cd dashboard && pnpm test && pnpm build
```

Expected: All tests pass, TypeScript errors 0, dist/ 생성.

- [ ] **Step 7: 커밋**

```bash
git add dashboard/src/lib/ dashboard/src/__tests__/trend.test.ts dashboard/src/App.tsx
git commit -m "feat(dashboard): App에 로고/요약 통계바/30일 trend 통합"
```

---

## Task 13: DESIGN.md 업데이트

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: DESIGN.md에 신규 섹션 추가**

`DESIGN.md` 파일의 `## Layout` 섹션 **앞**에 다음 섹션을 삽입:

```markdown
## New Widgets (2026-05-09)

### Sparkline (30-day pass-rate)
- SVG inline, 130×24px in card header.
- Stroke 1.4px, color: success(#27a644) when no failures, danger(#e5484d) otherwise.
- Failure dots (`r=1.4`, color danger, opacity 0.85) on points <100%.
- Last data point dot (`r=2.5`, accent color, surface-1 stroke).

### Browser Matrix
- Horizontal row in card body, separated from stats by border-top.
- Per browser: 22×22 rounded icon (Surface-3 default; success/danger muted on status), name (12px) + count (mono 10.5px).
- Browser ID → icon mapping: chromium=CR, webkit=WK, firefox=FF.

### Step Trail
- Mono chips of 11px joined by `→` arrows.
- Failed step: danger-muted bg, danger fg, prefix `✕ `, weight 500, inset 1px shadow.
- Lives inside FailureList items, indented 24px.

### Failure Card (extended)
- Two-column body grid: 132px screenshot placeholder + flexible error pre.
- Screenshot: aspect-ratio 16/10, layered radial+linear gradient placeholder, mono `📷 screenshot` tag at bottom-right.
- Attachments row: pill-shaped chips (10.5px mono, accent-muted bg).

### Flaky List
- Yellow accent: warning-muted bg, warning border (rgba(245,166,35,0.13)).
- Each row: ⚡ icon · test name · file:line · `retry N회 후 통과` pill.

### Slow Tests List
- 3-column grid: 320px name+file / 1fr bar track / 60px duration.
- Bar fill: linear-gradient accent → accent-hover.
- Duration in seconds with one decimal (e.g. `28.4s`).

### Color Tokens (added)
- `--warning: #f5a623`
- `--warning-muted: rgba(245, 166, 35, 0.14)`
- `--accent-muted: rgba(94, 106, 210, 0.15)`

### Typography (changed)
- Sans: `'Pretendard Variable'` (한글 가독성)
- Mono: `'JetBrains Mono'` for numbers, file paths, code (tabular-nums)
- Headings/body: 14px/1.5, letter-spacing -0.005em
```

- [ ] **Step 2: 커밋**

```bash
git add DESIGN.md
git commit -m "docs(design): 신규 위젯 (sparkline·browser matrix·step trail 등) 스펙 추가"
```

---

## Task 14: 통합 검증

**Files:**
- No code changes

- [ ] **Step 1: 모든 테스트 + 빌드**

```bash
cd dashboard && pnpm test && pnpm build
cd .. && node scripts/__tests__/parse-pw-results.test.js
```

Expected: 모든 테스트 PASS, TypeScript 에러 0.

- [ ] **Step 2: 개발 서버 실행 + 시각 확인**

```bash
cd dashboard && pnpm dev
```

브라우저에서 `http://localhost:5173` 열기.

> 실제 results JSON이 새 형식이 아닌 경우 카드가 깨질 수 있다. 우선 `dashboard-preview.html`을 옆 탭에 띄워두고 디자인 일치를 확인. 실제 데이터로 보려면 Step 3을 먼저 실행.

- [ ] **Step 3: 실제 파이프라인으로 새 데이터 1회 생성**

ca-admin 프로젝트에 multi-browser 설정이 없으면 단일 브라우저로 BrowserMatrix 1행만 보일 수 있다. 그래도 확인 가치 있음.

```bash
bash scripts/run-project.sh ca-admin
```

- [ ] **Step 4: docker compose 재기동 + nginx에서 확인**

```bash
cd dashboard && pnpm build && cd ..
docker compose restart || docker compose up -d --build
```

`http://localhost:8080` 에서 확인.

- [ ] **Step 5: 시안 ↔ 실제 비교 체크리스트**

브라우저 두 탭에 `dashboard-preview.html`과 `http://localhost:8080`을 띄워 비교:

- [ ] 헤더: 로고 + "E2E 테스트 대시보드" + 마지막 실행 시각
- [ ] 요약 통계 바: 프로젝트 수 / 통과·실패·flaky 점 / 전체 통과율
- [ ] 카드 좌측 status border (녹색/빨강/회색)
- [ ] 카드 헤더에 sparkline + 통과율 라벨
- [ ] Stats grid: 통과율(% + 비율) / 실행시간 / 실패건수 / flaky건수
- [ ] 통과율 progress bar (실패시 빨강, 통과시 녹색)
- [ ] BrowserMatrix: 브라우저별 아이콘 + 이름 + 통과/총
- [ ] FailureList: ✕ 마커 + 제목 + file:line + browser tag + step trail + screenshot placeholder + error pre + attachment chips
- [ ] FlakyList: ⚡ + 이름 + retry N회 후 통과
- [ ] SlowTestsList: 01~05 랭크 + 이름 + 막대 + 시간(s)
- [ ] HistoryTable: 통과율% + mini bar 컬럼
- [ ] 폰트: 한글 Pretendard, 숫자/파일명 JetBrains Mono

- [ ] **Step 6: 최종 커밋 + PR 노트**

체크리스트 통과 후, dashboard-preview.html은 "디자인 시안 보존용"으로 남겨두거나 삭제:

```bash
# 보존 (권장): docs/superpowers/specs/로 이동
mkdir -p docs/superpowers/specs
git mv dashboard-preview.html docs/superpowers/specs/2026-05-09-dashboard-data-rich-preview.html
git commit -m "chore: dashboard-preview.html을 specs로 이동 (시안 보존)"
```

또는 워크트리에서 PR 생성:

```bash
git push -u origin claude/eloquent-tu-cedc70
gh pr create --title "feat(dashboard): Playwright 데이터 풍부 시각화 + Linear 톤 유지" --body "$(cat <<'EOF'
## Summary
- 30일 통과율 sparkline / 브라우저 매트릭스 / step별 실행 흐름 / 실패 스크린샷 placeholder / Flaky / Slow Top 5 추가
- 디자인 레퍼런스: docs/superpowers/specs/2026-05-09-dashboard-data-rich-preview.html
- 폰트: Pretendard + JetBrains Mono로 교체

## Test plan
- [x] node scripts/__tests__/parse-pw-results.test.js
- [x] cd dashboard && pnpm test (Sparkline·BrowserMatrix·StepTrail·FlakyList·SlowTestsList·FailureList·HistoryTable·ProjectCard·trend)
- [x] cd dashboard && pnpm build (TypeScript 0 errors)
- [ ] 시안과 실제 화면 일치 확인 (Task 14 Step 5 체크리스트)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification Summary

| 검증 항목 | 명령 | 기대 결과 |
|-----------|------|-----------|
| 파서 단위 테스트 | `node scripts/__tests__/parse-pw-results.test.js` | `✅ All parse-pw-results tests passed` |
| 대시보드 단위 테스트 | `cd dashboard && pnpm test` | All component tests pass (≥25 tests) |
| 타입 체크 + 빌드 | `cd dashboard && pnpm build` | TypeScript errors 0, dist/ 생성 |
| 시각 검증 | `pnpm dev` + 시안 비교 | Task 14 Step 5 체크리스트 모두 ✅ |

---

## 1차에 포함하지 않는 것 (후속 PR로)

- **실제 attachment 파일 노출**: Playwright의 `test-results/...` 폴더에서 results/[project]/[date]/attachments/로 복사하여 nginx로 서빙. 1차에서는 메타(이름·contentType)만 표시, 링크는 비활성.
- **Trace viewer 연동**: trace.zip을 trace.playwright.dev로 점프시키는 버튼.
- **30일 누락 보간**: 결과가 없는 날을 점선이나 회색 영역으로 명시. 1차는 결과 있는 날만 점.
- **다중 워커/blob reporter 통합**: 단일 JSON reporter 가정.
