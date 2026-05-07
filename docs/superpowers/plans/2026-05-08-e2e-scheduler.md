# E2E 자동화 스케줄러 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매일 자동으로 Playwright E2E 테스트를 실행하고, JSON 결과를 저장하며, Slack으로 알리고, Docker/nginx로 팀 대시보드를 서빙하는 로컬 자동화 시스템 구축.

**Architecture:** Mac cron → shell scripts → Playwright 실행 (호스트에서 직접, VPN/내부망 접근 가능). Docker nginx 컨테이너가 Vite 빌드된 대시보드와 results JSON을 정적 파일로 서빙. 대시보드는 `results/manifest.json`으로 프로젝트 목록을 자동 인식.

**Tech Stack:** Bash, Node.js (스크립트), Vite + React + TypeScript + Tailwind CSS + shadcn/ui (대시보드), Docker + nginx (서빙)

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `.gitignore` | results/, .env, dist/ 제외 |
| `.env.example` | SLACK_WEBHOOK_URL 플레이스홀더 |
| `crontab.example` | Mac crontab 등록 안내 |
| `projects/ca-admin/config.json` | ca-admin 프로젝트 메타데이터 |
| `projects/ca-admin/run.sh` | playwright JSON 실행 래퍼 |
| `scripts/parse-pw-results.js` | Playwright JSON → 결과 JSON 변환 |
| `scripts/run-project.sh` | 단일 프로젝트 실행 + 결과 저장 + Slack |
| `scripts/run-all.sh` | 전체 프로젝트 순회 + manifest 업데이트 |
| `scripts/slack-notify.js` | Slack Webhook 전송 |
| `dashboard/src/types.ts` | Manifest, TestResult, TestFailure 타입 |
| `dashboard/src/api.ts` | fetch 헬퍼 + last30Days() |
| `dashboard/src/components/FailureList.tsx` | 실패 목록 컴포넌트 |
| `dashboard/src/components/HistoryTable.tsx` | 날짜별 히스토리 테이블 |
| `dashboard/src/components/ProjectCard.tsx` | 프로젝트 최신 결과 카드 |
| `dashboard/src/App.tsx` | 최상위 레이아웃 + 데이터 페칭 |
| `Dockerfile` | nginx:alpine 이미지 |
| `nginx.conf` | / → dashboard/dist, /results/ → results/ |
| `docker-compose.yml` | volume 마운트 + 포트 8080 |

---

## Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `crontab.example`
- Create: `logs/.gitkeep`

- [ ] **Step 1: .gitignore 작성**

```
results/
!results/.gitkeep
.env
dashboard/node_modules/
dashboard/dist/
logs/
!logs/.gitkeep
/tmp/pw-*.json
*.log
```

- [ ] **Step 2: .env.example 작성**

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

- [ ] **Step 3: crontab.example 작성**

```bash
# E2E 스케줄러 - 매일 오전 10시 실행
# 등록 방법: crontab -e 실행 후 아래 줄을 절대 경로로 수정해서 추가
0 10 * * * /bin/bash /absolute/path/to/e2e-scheduler/scripts/run-all.sh >> /absolute/path/to/e2e-scheduler/logs/cron.log 2>&1
```

- [ ] **Step 4: 디렉토리 placeholder 생성**

```bash
mkdir -p logs results
touch logs/.gitkeep results/.gitkeep
```

- [ ] **Step 5: 커밋**

```bash
git add .gitignore .env.example crontab.example logs/.gitkeep results/.gitkeep
git commit -m "chore: project scaffold"
```

---

## Task 2: ca-admin 프로젝트 설정

**Files:**
- Create: `projects/ca-admin/config.json`
- Create: `projects/ca-admin/run.sh`

- [ ] **Step 1: config.json 작성**

```json
{
  "name": "ca-admin",
  "path": "/Users/yongho/projects/ca-admin",
  "command": "pnpm playwright test",
  "slack_channel": "#qa-alerts"
}
```

> `path`는 실제 ca-admin 프로젝트 경로로 수정 필요.

- [ ] **Step 2: run.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

# Usage: run.sh <output_json_file>
# ca-admin Playwright 테스트를 JSON reporter로 실행, 결과를 $1에 저장
OUTPUT_FILE="$1"
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH=$(node -p "require('${CONFIG_DIR}/config.json').path")

cd "$PROJECT_PATH"
# 테스트 실패 시에도 JSON 출력은 생성되므로 || true 사용
pnpm playwright test --reporter=json > "$OUTPUT_FILE" 2>/dev/null || true
```

- [ ] **Step 3: 실행 권한 부여**

```bash
chmod +x projects/ca-admin/run.sh
```

- [ ] **Step 4: 커밋**

```bash
git add projects/
git commit -m "feat: add ca-admin project config and run script"
```

---

## Task 3: Playwright 결과 파서

**Files:**
- Create: `scripts/__tests__/parse-pw-results.test.js`
- Create: `scripts/parse-pw-results.js`

- [ ] **Step 1: 테스트 파일 작성**

`scripts/__tests__/parse-pw-results.test.js`:

```javascript
'use strict';
const assert = require('assert');
const { parsePlaywrightJSON } = require('../parse-pw-results');

const mockPWOutput = {
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
              status: 'unexpected',
              results: [{ status: 'failed', error: { message: 'Expected visible' } }],
            },
          ],
        },
        {
          title: '장바구니 추가',
          line: 10,
          tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
        },
      ],
      suites: [],
    },
  ],
  stats: {
    startTime: '2026-05-08T10:00:00.000Z',
    duration: 222500,
    expected: 47,
    unexpected: 3,
    skipped: 0,
  },
};

const result = parsePlaywrightJSON(mockPWOutput, 'ca-admin', '2026-05-08');

assert.strictEqual(result.project, 'ca-admin', 'project name');
assert.strictEqual(result.date, '2026-05-08', 'date');
assert.strictEqual(result.status, 'failed', 'status when unexpected > 0');
assert.strictEqual(result.total, 50, 'total = expected + unexpected + skipped');
assert.strictEqual(result.passed, 47, 'passed = expected');
assert.strictEqual(result.failed, 3, 'failed = unexpected');
assert.strictEqual(result.skipped, 0, 'skipped');
assert.strictEqual(result.duration, '3분 42초', 'duration format');
assert.strictEqual(result.failures.length, 1, 'one failure extracted');
assert.deepStrictEqual(result.failures[0], {
  test: '결제 완료 플로우',
  file: 'checkout.spec.ts',
  line: 84,
  error: 'Expected visible',
}, 'failure shape');

// 전부 통과한 경우
const passed = parsePlaywrightJSON(
  { suites: [], stats: { duration: 135000, expected: 50, unexpected: 0, skipped: 0 } },
  'proj', '2026-05-08'
);
assert.strictEqual(passed.status, 'passed', 'status when no failures');
assert.strictEqual(passed.duration, '2분 15초', 'duration under 60min');

console.log('✅ All parse-pw-results tests passed');
```

- [ ] **Step 2: 테스트 실행 - 실패 확인**

```bash
node scripts/__tests__/parse-pw-results.test.js
```

Expected: `Error: Cannot find module '../parse-pw-results'`

- [ ] **Step 3: parse-pw-results.js 작성**

`scripts/parse-pw-results.js`:

```javascript
#!/usr/bin/env node
'use strict';

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function collectFailures(suites) {
  const failures = [];
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      const isUnexpected = spec.tests?.some(t => t.status === 'unexpected');
      if (isUnexpected) {
        const failedResult = spec.tests
          ?.flatMap(t => t.results || [])
          ?.find(r => r.status === 'failed');
        failures.push({
          test: spec.title,
          file: suite.file || suite.title,
          line: spec.line || 0,
          error: failedResult?.error?.message || '',
        });
      }
    }
    failures.push(...collectFailures(suite.suites));
  }
  return failures;
}

function parsePlaywrightJSON(raw, projectName, date) {
  const { stats } = raw;
  const passed = stats.expected || 0;
  const failed = stats.unexpected || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    date,
    status: failed > 0 ? 'failed' : 'passed',
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    duration: formatDuration(stats.duration || 0),
    failures: collectFailures(raw.suites),
  };
}

if (require.main === module) {
  const [,, pwOutputFile, projectName, date] = process.argv;
  const raw = JSON.parse(require('fs').readFileSync(pwOutputFile, 'utf8'));
  console.log(JSON.stringify(parsePlaywrightJSON(raw, projectName, date), null, 2));
}

module.exports = { parsePlaywrightJSON };
```

- [ ] **Step 4: 테스트 재실행 - 통과 확인**

```bash
node scripts/__tests__/parse-pw-results.test.js
```

Expected: `✅ All parse-pw-results tests passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/
git commit -m "feat: add playwright result parser with tests"
```

---

## Task 4: run-project.sh

**Files:**
- Create: `scripts/run-project.sh`

- [ ] **Step 1: run-project.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PROJECT_NAME="$1"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECT_NAME"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] Project not found: $PROJECT_NAME" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
RESULTS_DIR="$REPO_ROOT/results/$PROJECT_NAME"
RESULTS_FILE="$RESULTS_DIR/$DATE.json"
PW_OUTPUT="/tmp/pw-${PROJECT_NAME}-${DATE}.json"

mkdir -p "$RESULTS_DIR"

echo "[$(date -u +%H:%M:%S)] Starting $PROJECT_NAME E2E tests..."

bash "$PROJECT_DIR/run.sh" "$PW_OUTPUT"

node "$SCRIPT_DIR/parse-pw-results.js" "$PW_OUTPUT" "$PROJECT_NAME" "$DATE" > "$RESULTS_FILE"
echo "[$(date -u +%H:%M:%S)] Results saved: $RESULTS_FILE"

# .env 로드 (있는 경우)
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

node "$SCRIPT_DIR/slack-notify.js" "$RESULTS_FILE"
echo "[$(date -u +%H:%M:%S)] Slack notification sent for $PROJECT_NAME"
```

- [ ] **Step 2: 실행 권한 부여**

```bash
chmod +x scripts/run-project.sh
```

- [ ] **Step 3: 커밋**

```bash
git add scripts/run-project.sh
git commit -m "feat: add run-project.sh orchestration script"
```

---

## Task 5: run-all.sh

**Files:**
- Create: `scripts/run-all.sh`

- [ ] **Step 1: run-all.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECTS_DIR="$REPO_ROOT/projects"
MANIFEST_FILE="$REPO_ROOT/results/manifest.json"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all started"

# 프로젝트 존재 여부 확인
if ! ls "$PROJECTS_DIR"/*/config.json > /dev/null 2>&1; then
  echo "[ERROR] No projects found in $PROJECTS_DIR" >&2
  exit 1
fi

# 각 프로젝트 실행 (실패해도 계속 진행)
for config in "$PROJECTS_DIR"/*/config.json; do
  [[ -f "$config" ]] || continue
  project=$(node -p "require('$config').name")
  echo "--- Running: $project ---"
  bash "$SCRIPT_DIR/run-project.sh" "$project" \
    || echo "[WARN] $project finished with errors, continuing..."
done

# manifest.json 업데이트 (Node.js로 파일 시스템 기반 생성)
node -e "
const path = require('path');
const fs = require('fs');
const dir = '$PROJECTS_DIR';
const projects = fs.readdirSync(dir)
  .filter(d => fs.existsSync(path.join(dir, d, 'config.json')))
  .map(d => require(path.join(dir, d, 'config.json')).name);
fs.mkdirSync(path.dirname('$MANIFEST_FILE'), { recursive: true });
fs.writeFileSync('$MANIFEST_FILE', JSON.stringify({ projects, lastUpdated: new Date().toISOString() }, null, 2));
console.log('Manifest updated:', projects);
"

echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] run-all complete"
```

- [ ] **Step 2: 실행 권한 부여**

```bash
chmod +x scripts/run-all.sh
```

- [ ] **Step 3: 커밋**

```bash
git add scripts/run-all.sh
git commit -m "feat: add run-all.sh with manifest update"
```

---

## Task 6: slack-notify.js

**Files:**
- Create: `scripts/slack-notify.js`

- [ ] **Step 1: slack-notify.js 작성**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const [,, resultsFile] = process.argv;
const result = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('[ERROR] SLACK_WEBHOOK_URL is not set');
  process.exit(1);
}

const statusIcon = result.status === 'passed' ? '✅' : '❌';
const lines = [
  `[E2E 테스트 결과] ${result.project}`,
  `${statusIcon} ${result.passed}/${result.total} 통과 | ❌ ${result.failed}건 실패 | ⏱ ${result.duration}`,
];

if (result.failures.length > 0) {
  lines.push('실패 목록:');
  for (const f of result.failures) {
    lines.push(`- ${f.file} > ${f.test} (${f.line}번째 줄)`);
  }
}

const body = JSON.stringify({ text: lines.join('\n') });
const parsed = new URL(webhookUrl);

const req = https.request(
  {
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  res => {
    console.log(`Slack response: ${res.statusCode}`);
    if (res.statusCode !== 200) process.exit(1);
  }
);

req.on('error', err => {
  console.error('[ERROR] Slack notification failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
```

- [ ] **Step 2: 수동 테스트 (Webhook URL 설정 후)**

```bash
# .env에 실제 SLACK_WEBHOOK_URL 설정 후:
source .env
# 테스트용 결과 JSON 생성
echo '{"project":"test","date":"2026-05-08","status":"passed","total":5,"passed":5,"failed":0,"skipped":0,"duration":"10초","failures":[]}' > /tmp/test-result.json
node scripts/slack-notify.js /tmp/test-result.json
```

Expected: `Slack response: 200`, #qa-alerts에 메시지 수신

- [ ] **Step 3: 커밋**

```bash
git add scripts/slack-notify.js
git commit -m "feat: add slack notification script"
```

---

## Task 7: 대시보드 Vite 프로젝트 초기화

**Files:**
- Create: `dashboard/` (Vite + React + TS + Tailwind + shadcn)

- [ ] **Step 1: Vite 프로젝트 생성**

```bash
mkdir -p dashboard
cd dashboard
pnpm create vite . --template react-ts
pnpm install
```

- [ ] **Step 2: shadcn 초기화 (Tailwind 포함 자동 설정)**

```bash
pnpm dlx shadcn@latest init
```

프롬프트에서:
- Style: Default
- Base color: Slate
- CSS variables: Yes

- [ ] **Step 3: 필요한 shadcn 컴포넌트 추가**

```bash
pnpm dlx shadcn@latest add card badge table collapsible
```

- [ ] **Step 4: 테스트 의존성 추가**

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 5: vite.config.ts 수정 (테스트 설정 + 개발 프록시)**

`dashboard/vite.config.ts`:

```typescript
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
  server: {
    proxy: {
      '/results': 'http://localhost:8080',
    },
  },
})
```

> Note: shadcn init이 tailwind plugin 방식을 변경할 수 있음. init 후 생성된 설정을 확인하고 `test` 블록과 `server.proxy`만 추가.

- [ ] **Step 6: setupTests.ts 작성**

`dashboard/src/setupTests.ts`:

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 7: package.json에 test 스크립트 추가**

`dashboard/package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: 빌드 테스트**

```bash
cd dashboard && pnpm build
```

Expected: `dashboard/dist/` 생성, 오류 없음

- [ ] **Step 9: 커밋**

```bash
cd ..
git add dashboard/
git commit -m "chore: initialize dashboard vite project with shadcn"
```

---

## Task 8: types.ts + api.ts

**Files:**
- Create: `dashboard/src/types.ts`
- Create: `dashboard/src/api.ts`
- Create: `dashboard/src/__tests__/api.test.ts`

- [ ] **Step 1: types.ts 작성**

`dashboard/src/types.ts`:

```typescript
export interface Manifest {
  projects: string[];
  lastUpdated: string;
}

export interface TestFailure {
  test: string;
  file: string;
  line: number;
  error: string;
}

export interface TestResult {
  project: string;
  date: string;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: TestFailure[];
}
```

- [ ] **Step 2: api.ts 테스트 작성**

`dashboard/src/__tests__/api.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { last30Days } from '../api';

describe('last30Days', () => {
  it('returns 30 items', () => {
    expect(last30Days()).toHaveLength(30);
  });

  it('first item is today in YYYY-MM-DD format', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(last30Days()[0]).toBe(today);
  });

  it('items are in descending order', () => {
    const days = last30Days();
    expect(days[0] > days[1]).toBe(true);
    expect(days[1] > days[2]).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행 - 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../api'`

- [ ] **Step 4: api.ts 작성**

`dashboard/src/api.ts`:

```typescript
import type { Manifest, TestResult } from './types';

const BASE = '/results';

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchResult(
  project: string,
  date: string
): Promise<TestResult | null> {
  const res = await fetch(`${BASE}/${project}/${date}.json`);
  if (!res.ok) return null;
  return res.json();
}

export function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}
```

- [ ] **Step 5: 테스트 재실행 - 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: 3 tests pass

- [ ] **Step 6: 커밋**

```bash
cd ..
git add dashboard/src/types.ts dashboard/src/api.ts dashboard/src/__tests__/
git commit -m "feat: add types and api helpers"
```

---

## Task 9: FailureList 컴포넌트

**Files:**
- Create: `dashboard/src/components/__tests__/FailureList.test.tsx`
- Create: `dashboard/src/components/FailureList.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/FailureList.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  { test: '결제 완료 플로우', file: 'checkout.spec.ts', line: 84, error: 'Expected visible' },
  { test: '토큰 만료 처리', file: 'auth.spec.ts', line: 201, error: 'Timeout exceeded' },
];

it('renders all failure items', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('토큰 만료 처리')).toBeInTheDocument();
  expect(screen.getByText(/checkout\.spec\.ts/)).toBeInTheDocument();
  expect(screen.getByText(/84번째 줄/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: 테스트 실행 - 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../FailureList'`

- [ ] **Step 3: FailureList.tsx 작성**

`dashboard/src/components/FailureList.tsx`:

```typescript
import type { TestFailure } from '../types';

interface Props {
  failures: TestFailure[];
}

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {failures.map((f, i) => (
        <li key={i} className="rounded-md bg-red-50 px-3 py-2 text-sm">
          <span className="font-medium text-red-700">{f.test}</span>
          <span className="ml-2 text-red-500">
            {f.file} · {f.line}번째 줄
          </span>
          {f.error && (
            <p className="mt-1 truncate text-xs text-red-400">{f.error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 테스트 재실행 - 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: FailureList tests pass

- [ ] **Step 5: 커밋**

```bash
cd ..
git add dashboard/src/components/
git commit -m "feat: add FailureList component"
```

---

## Task 10: HistoryTable 컴포넌트

**Files:**
- Create: `dashboard/src/components/__tests__/HistoryTable.test.tsx`
- Create: `dashboard/src/components/HistoryTable.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/HistoryTable.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { HistoryTable } from '../HistoryTable';
import type { TestResult } from '../../types';

const results: TestResult[] = [
  {
    project: 'ca-admin', date: '2026-05-08', status: 'failed',
    total: 50, passed: 47, failed: 3, skipped: 0, duration: '3분 42초', failures: [],
  },
  {
    project: 'ca-admin', date: '2026-05-07', status: 'passed',
    total: 50, passed: 50, failed: 0, skipped: 0, duration: '2분 15초', failures: [],
  },
];

it('renders a row per result plus header', () => {
  render(<HistoryTable results={results} />);
  // header row + 2 data rows = 3
  expect(screen.getAllByRole('row')).toHaveLength(3);
});

it('shows date and duration', () => {
  render(<HistoryTable results={results} />);
  expect(screen.getByText('2026-05-08')).toBeInTheDocument();
  expect(screen.getByText('3분 42초')).toBeInTheDocument();
});

it('shows failed badge for failed results', () => {
  render(<HistoryTable results={results} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('renders empty state when no results', () => {
  render(<HistoryTable results={[]} />);
  expect(screen.getByText('실행 기록 없음')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실행 - 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../HistoryTable'`

- [ ] **Step 3: HistoryTable.tsx 작성**

`dashboard/src/components/HistoryTable.tsx`:

```typescript
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">실행 기록 없음</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>날짜</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>통과</TableHead>
          <TableHead>실패</TableHead>
          <TableHead>소요시간</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map(r => (
          <TableRow key={r.date}>
            <TableCell>{r.date}</TableCell>
            <TableCell>
              <Badge variant={r.status === 'passed' ? 'default' : 'destructive'}>
                {r.status === 'passed' ? '통과' : '실패'}
              </Badge>
            </TableCell>
            <TableCell>{r.passed}</TableCell>
            <TableCell>{r.failed}</TableCell>
            <TableCell>{r.duration}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: 테스트 재실행 - 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: HistoryTable tests pass

- [ ] **Step 5: 커밋**

```bash
cd ..
git add dashboard/src/components/
git commit -m "feat: add HistoryTable component"
```

---

## Task 11: ProjectCard 컴포넌트

**Files:**
- Create: `dashboard/src/components/__tests__/ProjectCard.test.tsx`
- Create: `dashboard/src/components/ProjectCard.tsx`

- [ ] **Step 1: 테스트 작성**

`dashboard/src/components/__tests__/ProjectCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '../ProjectCard';
import type { TestResult } from '../../types';

const failedResult: TestResult = {
  project: 'ca-admin', date: '2026-05-08', status: 'failed',
  total: 50, passed: 47, failed: 3, skipped: 0, duration: '3분 42초',
  failures: [
    { test: '결제 완료 플로우', file: 'checkout.spec.ts', line: 84, error: 'err' },
  ],
};

const passedResult: TestResult = {
  project: 'ca-admin', date: '2026-05-08', status: 'passed',
  total: 50, passed: 50, failed: 0, skipped: 0, duration: '2분 15초', failures: [],
};

it('displays project name', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} />);
  expect(screen.getByText('ca-admin')).toBeInTheDocument();
});

it('shows 실패 badge and failure count when failed', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[failedResult]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
  expect(screen.getByText(/3건 실패/)).toBeInTheDocument();
});

it('shows 통과 badge when all passed', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[passedResult]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('shows duration', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} />);
  expect(screen.getByText('2분 15초')).toBeInTheDocument();
});

it('renders loading state when no latest result', () => {
  render(<ProjectCard projectName="ca-admin" latest={null} history={[]} />);
  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실행 - 실패 확인**

```bash
cd dashboard && pnpm test
```

Expected: `Cannot find module '../ProjectCard'`

- [ ] **Step 3: ProjectCard.tsx 작성**

`dashboard/src/components/ProjectCard.tsx`:

```typescript
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { TestResult } from '../types';
import { FailureList } from './FailureList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
}

export function ProjectCard({ projectName, latest, history }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">{projectName}</CardTitle>
        {latest ? (
          <Badge variant={latest.status === 'passed' ? 'default' : 'destructive'}>
            {latest.status === 'passed' ? '통과' : '실패'}
          </Badge>
        ) : (
          <Badge variant="secondary">데이터 없음</Badge>
        )}
      </CardHeader>
      <CardContent>
        {latest ? (
          <>
            <p className="text-sm text-muted-foreground">
              {latest.passed}/{latest.total} 통과
              {latest.failed > 0 && (
                <span className="ml-2 text-red-500">{latest.failed}건 실패</span>
              )}
              <span className="ml-2">⏱ {latest.duration}</span>
            </p>
            {latest.failures.length > 0 && (
              <FailureList failures={latest.failures} />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">데이터 없음</p>
        )}

        {history.length > 0 && (
          <Collapsible className="mt-4">
            <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              히스토리 보기 ({history.length}건)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <HistoryTable results={history} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: 테스트 재실행 - 통과 확인**

```bash
cd dashboard && pnpm test
```

Expected: all ProjectCard tests pass

- [ ] **Step 5: 커밋**

```bash
cd ..
git add dashboard/src/components/
git commit -m "feat: add ProjectCard component"
```

---

## Task 12: App.tsx + 빌드

**Files:**
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/index.html` (타이틀)

- [ ] **Step 1: App.tsx 작성**

`dashboard/src/App.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { fetchManifest, fetchResult, last30Days } from './api';
import { ProjectCard } from './components/ProjectCard';
import type { TestResult } from './types';

interface ProjectData {
  name: string;
  latest: TestResult | null;
  history: TestResult[];
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

            return { name, latest: results[0] ?? null, history: results };
          })
        );
        setProjects(projectData);
      } catch (e) {
        setError('결과를 불러오지 못했습니다. Docker 컨테이너가 실행 중인지 확인하세요.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-semibold">E2E 테스트 대시보드</h1>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              마지막 실행: {new Date(lastUpdated).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
        {projects.length === 0 && !error ? (
          <p className="text-center text-muted-foreground">
            등록된 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="grid gap-4">
            {projects.map(p => (
              <ProjectCard
                key={p.name}
                projectName={p.name}
                latest={p.latest}
                history={p.history}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: index.html 타이틀 수정**

`dashboard/index.html`의 `<title>` 태그를:

```html
<title>E2E 테스트 대시보드</title>
```

- [ ] **Step 3: 개발 서버 확인 (Docker 실행 중일 때)**

```bash
cd dashboard && pnpm dev
```

`http://localhost:5173` 에서 대시보드 확인. Docker nginx가 없으면 "불러오는 중..." 이후 에러 메시지 표시됨 — 정상.

- [ ] **Step 4: 프로덕션 빌드**

```bash
cd dashboard && pnpm build
```

Expected: `dashboard/dist/` 생성, 오류 없음

- [ ] **Step 5: 커밋**

```bash
cd ..
git add dashboard/src/App.tsx dashboard/index.html dashboard/dist/
git commit -m "feat: add App layout and build dashboard"
```

---

## Task 13: Docker + nginx 설정

**Files:**
- Create: `Dockerfile`
- Create: `nginx.conf`
- Create: `docker-compose.yml`

- [ ] **Step 1: nginx.conf 작성**

```nginx
server {
    listen 8080;

    location / {
        root /usr/share/nginx/html/dashboard;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /results/ {
        alias /usr/share/nginx/html/results/;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

- [ ] **Step 2: Dockerfile 작성**

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# dashboard/dist와 results는 docker-compose volume으로 마운트
```

- [ ] **Step 3: docker-compose.yml 작성**

```yaml
services:
  dashboard:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./dashboard/dist:/usr/share/nginx/html/dashboard:ro
      - ./results:/usr/share/nginx/html/results:ro
    restart: unless-stopped
```

- [ ] **Step 4: Docker 빌드 + 실행**

```bash
docker compose up -d --build
```

Expected: 컨테이너 시작, 오류 없음

- [ ] **Step 5: nginx 동작 확인**

```bash
curl http://localhost:8080/
```

Expected: HTML 응답 (대시보드 index.html)

- [ ] **Step 6: 커밋**

```bash
git add Dockerfile nginx.conf docker-compose.yml
git commit -m "feat: add Docker and nginx config"
```

---

## Task 14: 통합 검증 + crontab 등록

- [ ] **Step 1: run-project.sh 수동 실행 테스트**

먼저 `.env` 파일 생성:
```bash
cp .env.example .env
# SLACK_WEBHOOK_URL 실제 값으로 수정
```

실행:
```bash
bash scripts/run-project.sh ca-admin
```

Expected:
- `results/ca-admin/YYYY-MM-DD.json` 파일 생성
- Slack #qa-alerts에 메시지 수신

- [ ] **Step 2: manifest 확인**

```bash
bash scripts/run-all.sh
cat results/manifest.json
```

Expected:
```json
{
  "projects": ["ca-admin"],
  "lastUpdated": "2026-05-08T..."
}
```

- [ ] **Step 3: 대시보드에서 결과 확인**

```
http://localhost:8080
```

Expected: ca-admin 카드에 최신 결과 표시

- [ ] **Step 4: Mac crontab 등록**

```bash
crontab -e
```

다음 줄 추가 (경로는 실제 경로로 수정):
```
0 10 * * * /bin/bash /Users/yongho/e2e-scheduler/scripts/run-all.sh >> /Users/yongho/e2e-scheduler/logs/cron.log 2>&1
```

등록 확인:
```bash
crontab -l
```

- [ ] **Step 5: 최종 커밋**

```bash
git add .
git commit -m "docs: add integration verification notes"
```

---

## 검증 체크리스트

- [ ] `node scripts/__tests__/parse-pw-results.test.js` → 통과
- [ ] `cd dashboard && pnpm test` → 모든 컴포넌트 테스트 통과
- [ ] `cd dashboard && pnpm build` → 오류 없음
- [ ] `bash scripts/run-project.sh ca-admin` → JSON 저장 + Slack 수신
- [ ] `http://localhost:8080` → 대시보드 렌더링 정상
- [ ] `crontab -l` → 10시 cron 등록 확인
