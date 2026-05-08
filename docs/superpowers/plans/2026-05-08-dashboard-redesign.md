# Dashboard Redesign (Linear Dark Theme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E 대시보드를 Linear 디자인 시스템 기반 다크 테마로 재디자인하여 가독성과 시각적 품질을 개선한다.

**Architecture:** Linear의 다크 서피스 계층 시스템(surface-1~4)과 라벤더-블루 액센트(#5e6ad2)를 적용. 기존 shadcn/ui 토큰을 Linear 팔레트 값으로 덮어쓰고, 진입점을 항상 다크 모드로 고정한다. 컴포넌트 구조(props/text)는 유지하고 Tailwind 클래스와 CSS 변수만 교체한다.

**Tech Stack:** React 19, Tailwind CSS v4, shadcn/ui, Geist Variable (기설치), lucide-react (기설치)

**Design Reference:** awesome-design-md/linear DESIGN.md — `#5e6ad2` accent, `#010102` canvas, charcoal surface hierarchy, `#27a644` success, `#e5484d` danger

---

## File Map

| 파일 | 변경 내용 |
|------|-----------|
| `DESIGN.md` | 신규: 이 프로젝트용 Linear 기반 디자인 스펙 |
| `dashboard/src/index.css` | shadcn 토큰 전면 교체 (다크 고정), `#root` 스타일 정리 |
| `dashboard/src/App.tsx` | 헤더 리스타일링, 프로젝트 요약 통계 바 추가 |
| `dashboard/src/components/ProjectCard.tsx` | 상태 경계선, 패스율 프로그레스 바, 통계 인라인 레이아웃 |
| `dashboard/src/components/HistoryTable.tsx` | 다크 테이블, 상태별 색상 텍스트 |
| `dashboard/src/components/FailureList.tsx` | 다크 에러 카드 스타일링 |

---

### Task 1: DESIGN.md 추가

**Files:**
- Create: `DESIGN.md` (프로젝트 루트)

- [ ] **Step 1: DESIGN.md 파일 생성**

```markdown
# E2E Dashboard DESIGN.md

Adapted from Linear's design system (https://github.com/VoltAgent/awesome-design-md).

## Color Palette

### Canvas & Surfaces
- Canvas (page bg): `#010102`
- Surface-1 (cards): `#16171d`
- Surface-2 (nested): `#1e1f26`
- Surface-3 (hover): `#26272f`
- Surface-4 (borders visible): `#2e303a`

### Text
- Primary: `#f7f8f8`
- Secondary: `#d0d6e0`
- Muted: `#8a8f98`
- Faint: `#62666d`

### Semantic
- Accent (interactive): `#5e6ad2`
- Accent hover: `#828fff`
- Success: `#27a644`
- Success muted bg: `rgba(39, 166, 68, 0.12)`
- Danger: `#e5484d`
- Danger muted bg: `rgba(229, 72, 77, 0.12)`

### Borders
- Subtle: `rgba(255,255,255,0.06)`
- Default: `rgba(255,255,255,0.10)`

## Typography
- Font: Geist Variable (already installed via @fontsource-variable/geist)
- Heading weight: 500–600
- Body: 14px/1.5, weight 400
- Mono: ui-monospace (error messages)

## Components

### Cards
- Background: Surface-1 (`#16171d`)
- Border: 1px `rgba(255,255,255,0.06)`
- Border-radius: 8px
- No box-shadows; depth via surface hierarchy only

### Status Indicators
- Passed: left border 2px `#27a644` + green text
- Failed: left border 2px `#e5484d` + red text
- No data: left border 2px `#2e303a` + muted text

### Progress Bar
- Track: Surface-3 (`#26272f`)
- Fill: green `#27a644` (pass) or red `#e5484d` (any failures)
- Height: 4px, border-radius: 2px

### Badges
- Passed: bg `rgba(39,166,68,0.15)`, text `#27a644`
- Failed: bg `rgba(229,72,77,0.15)`, text `#e5484d`
- No data: bg Surface-3, text muted

## Layout
- Page max-width: 896px (max-w-4xl)
- Card gap: 12px
- Card padding: 20px 24px
```

- [ ] **Step 2: 커밋**

```bash
git add DESIGN.md
git commit -m "docs: Linear 기반 대시보드 디자인 스펙 추가"
```

---

### Task 2: index.css — Linear 다크 토큰으로 전면 교체

**Files:**
- Modify: `dashboard/src/index.css`

- [ ] **Step 1: 테스트 통과 확인 (기준선)**

```bash
cd dashboard && pnpm test
```
Expected: All tests pass

- [ ] **Step 2: index.css 전면 교체**

`dashboard/src/index.css` 내용을 아래로 교체:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";

@custom-variant dark (&:is(.dark *));

/* Linear dark palette — always dark */
:root {
  /* shadcn/ui token overrides */
  --background: oklch(0.04 0 0);
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.13 0.006 264);
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.17 0.007 264);
  --popover-foreground: oklch(0.98 0 0);
  --primary: oklch(0.52 0.18 270);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.22 0.008 264);
  --secondary-foreground: oklch(0.87 0.01 254);
  --muted: oklch(0.22 0.008 264);
  --muted-foreground: oklch(0.61 0.008 254);
  --accent: oklch(0.52 0.18 270);
  --accent-foreground: oklch(0.98 0 0);
  --destructive: oklch(0.59 0.21 24);
  --border: oklch(1 0 0 / 0.06);
  --input: oklch(1 0 0 / 0.10);
  --ring: oklch(0.52 0.18 270);
  --radius: 0.5rem;

  /* Linear surface hierarchy */
  --surface-1: #16171d;
  --surface-2: #1e1f26;
  --surface-3: #26272f;
  --surface-4: #2e303a;

  /* Semantic colors */
  --success: #27a644;
  --success-muted: rgba(39, 166, 68, 0.12);
  --danger: #e5484d;
  --danger-muted: rgba(229, 72, 77, 0.12);
  --accent-color: #5e6ad2;
  --accent-hover: #828fff;

  /* Text hierarchy */
  --text-primary: #f7f8f8;
  --text-secondary: #d0d6e0;
  --text-muted: #8a8f98;
  --text-faint: #62666d;

  /* Border */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);

  font: 14px/1.5 'Geist Variable', system-ui, sans-serif;
  letter-spacing: 0.01em;
  color: var(--text-primary);
  background: #010102;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  width: 100%;
  min-height: 100svh;
  background: #010102;
}

body {
  margin: 0;
  background: #010102;
}

@theme inline {
  --font-sans: 'Geist Variable', system-ui, sans-serif;
  --font-heading: 'Geist Variable', system-ui, sans-serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.75);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) * 1.5);
  --radius-xl: calc(var(--radius) * 2);
  --radius-2xl: calc(var(--radius) * 2.5);
  --radius-3xl: calc(var(--radius) * 3);
  --radius-4xl: calc(var(--radius) * 3.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 3: 테스트 재확인**

```bash
cd dashboard && pnpm test
```
Expected: All tests still pass (CSS 변경은 텍스트 assertion에 영향 없음)

- [ ] **Step 4: 커밋**

```bash
git add dashboard/src/index.css
git commit -m "style: Linear 다크 테마 색상 토큰으로 교체"
```

---

### Task 3: App.tsx — 헤더 + 요약 통계 바

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: App.tsx 교체**

`dashboard/src/App.tsx` 내용을 아래로 교체:

```tsx
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
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  const passedCount = projects.filter(p => p.latest?.status === 'passed').length;
  const failedCount = projects.filter(p => p.latest?.status === 'failed').length;
  const noDataCount = projects.filter(p => !p.latest).length;

  return (
    <div className="min-h-screen" style={{ background: '#010102' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              E2E 테스트 대시보드
            </span>
          </div>
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              마지막 실행:{' '}
              {new Date(lastUpdated).toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </header>

      {/* Summary bar */}
      {projects.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="mx-auto flex max-w-4xl items-center gap-5 px-6 py-2.5">
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {projects.length}개 프로젝트
            </span>
            {passedCount > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                ● {passedCount} 통과
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                ● {failedCount} 실패
              </span>
            )}
            {noDataCount > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                ● {noDataCount} 데이터 없음
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="mx-auto max-w-4xl px-6 py-5">
        {error && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              border: '1px solid rgba(229,72,77,0.2)',
            }}
          >
            {error}
          </div>
        )}
        {projects.length === 0 && !error ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            등록된 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
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

- [ ] **Step 2: 테스트 확인**

```bash
cd dashboard && pnpm test
```
Expected: All tests pass

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/App.tsx
git commit -m "style: 대시보드 헤더 및 요약 통계 바 추가"
```

---

### Task 4: ProjectCard.tsx — 패스율 바 + Linear 카드 스타일

**Files:**
- Modify: `dashboard/src/components/ProjectCard.tsx`

- [ ] **Step 1: ProjectCard.tsx 교체**

`dashboard/src/components/ProjectCard.tsx` 내용을 아래로 교체:

```tsx
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { TestResult } from '../types';
import { FailureList } from './FailureList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
}

function StatusBadge({ status }: { status: 'passed' | 'failed' | null }) {
  if (!status) {
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}
      >
        데이터 없음
      </span>
    );
  }
  if (status === 'passed') {
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ background: 'var(--success-muted)', color: 'var(--success)' }}
      >
        통과
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}
    >
      실패
    </span>
  );
}

export function ProjectCard({ projectName, latest, history }: Props) {
  const passRate = latest && latest.total > 0
    ? Math.round((latest.passed / latest.total) * 100)
    : null;

  const statusColor = !latest
    ? 'var(--surface-4)'
    : latest.status === 'passed'
      ? 'var(--success)'
      : 'var(--danger)';

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${statusColor}`,
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {projectName}
        </span>
        <StatusBadge status={latest?.status ?? null} />
      </div>

      {/* Progress bar */}
      {passRate !== null && (
        <div className="px-5 pb-3">
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--surface-3)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${passRate}%`,
                background: latest?.failed ? 'var(--danger)' : 'var(--success)',
              }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      {latest && (
        <div className="flex items-center gap-4 px-5 pb-4">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {latest.passed}
            </span>
            <span className="mx-0.5">/</span>
            {latest.total} 통과
          </span>
          {latest.failed > 0 && (
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              {latest.failed}건 실패
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {latest.duration}
          </span>
        </div>
      )}

      {/* Failure list */}
      {latest?.failures && latest.failures.length > 0 && (
        <div
          className="mx-5 mb-4 rounded-md overflow-hidden"
          style={{ border: '1px solid rgba(229,72,77,0.15)' }}
        >
          <FailureList failures={latest.failures} />
        </div>
      )}

      {/* History collapsible */}
      {history.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger
            className="flex w-full items-center justify-between px-5 py-2.5 text-xs transition-colors"
            style={{
              borderTop: '1px solid var(--border-subtle)',
              color: 'var(--text-faint)',
            }}
          >
            <span>히스토리 보기 ({history.length}건)</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-4 pt-2">
              <HistoryTable results={history} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 테스트 확인**

```bash
cd dashboard && pnpm test
```
Expected: All tests pass. ProjectCard tests check '통과', '실패', '데이터 없음', '3건 실패', '2분 15초', 'ca-admin' — 모두 유지됨.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/components/ProjectCard.tsx
git commit -m "style: ProjectCard에 패스율 바 및 Linear 카드 스타일 적용"
```

---

### Task 5: HistoryTable.tsx — 다크 테이블 스타일

**Files:**
- Modify: `dashboard/src/components/HistoryTable.tsx`

- [ ] **Step 1: HistoryTable.tsx 교체**

`dashboard/src/components/HistoryTable.tsx` 내용을 아래로 교체:

```tsx
import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        실행 기록 없음
      </p>
    );
  }

  return (
    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {['날짜', '상태', '성공 수', '실패 수', '소요시간'].map(h => (
            <th
              key={h}
              className="pb-2 text-left font-medium"
              style={{ color: 'var(--text-faint)' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map(r => (
          <tr
            key={r.date}
            className="transition-colors"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <td className="py-2 pr-4" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {r.date}
            </td>
            <td className="py-2 pr-4">
              <span
                className="font-medium"
                style={{ color: r.status === 'passed' ? 'var(--success)' : 'var(--danger)' }}
              >
                {r.status === 'passed' ? '통과' : '실패'}
              </span>
            </td>
            <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {r.passed}
            </td>
            <td className="py-2 pr-4" style={{ color: r.failed > 0 ? 'var(--danger)' : 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
              {r.failed}
            </td>
            <td className="py-2" style={{ color: 'var(--text-faint)' }}>
              {r.duration}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: 테스트 확인**

```bash
cd dashboard && pnpm test
```
Expected: All tests pass. HistoryTable tests check `getAllByRole('row')` (3행), '2026-05-08', '3분 42초', '실패', '통과', '실행 기록 없음' — 모두 유지됨. shadcn Table 컴포넌트를 네이티브 `<table>`로 교체했으므로 row role은 동일하게 유지됨.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/components/HistoryTable.tsx
git commit -m "style: HistoryTable 다크 테마 적용"
```

---

### Task 6: FailureList.tsx — 다크 에러 카드

**Files:**
- Modify: `dashboard/src/components/FailureList.tsx`

- [ ] **Step 1: FailureList.tsx 교체**

`dashboard/src/components/FailureList.tsx` 내용을 아래로 교체:

```tsx
import type { TestFailure } from '../types';

interface Props {
  failures: TestFailure[];
}

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <ul className="divide-y" style={{ '--tw-divide-color': 'rgba(229,72,77,0.1)' } as React.CSSProperties}>
      {failures.map((f, i) => (
        <li
          key={i}
          className="px-3 py-2.5"
          style={{ background: 'var(--danger-muted)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              {f.test}
            </span>
            <span className="shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
              {f.file} · {f.line}번째 줄
            </span>
          </div>
          {f.error && (
            <p
              className="mt-1 truncate font-mono text-xs"
              style={{ color: 'var(--text-faint)' }}
            >
              {f.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: 테스트 확인**

```bash
cd dashboard && pnpm test
```
Expected: All tests pass. FailureList tests check '결제 완료 플로우', '토큰 만료 처리', /checkout\.spec\.ts/, /84번째 줄/ — 모두 유지됨.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/src/components/FailureList.tsx
git commit -m "style: FailureList 다크 에러 카드 스타일 적용"
```

---

### Task 7: 빌드 & 시각 검증

**Files:**
- No changes

- [ ] **Step 1: 전체 테스트 + 빌드**

```bash
cd dashboard && pnpm test && pnpm build
```
Expected: All tests pass, build succeeds with no TypeScript errors.

- [ ] **Step 2: 개발 서버 실행**

```bash
cd dashboard && pnpm dev
```
브라우저에서 `http://localhost:5173` 열기

- [ ] **Step 3: 시각 체크리스트**

- [ ] 배경이 near-black (#010102) 인지 확인
- [ ] 헤더에 "E2E 테스트 대시보드" + 마지막 실행 시각 표시
- [ ] 요약 바에 통과/실패 프로젝트 수 색상 표시
- [ ] 카드 왼쪽에 status 색상 경계선 (녹색/빨강)
- [ ] 패스율 프로그레스 바 표시
- [ ] 히스토리 토글 시 다크 테이블 표시
- [ ] 실패 항목 dark red 배경으로 표시

- [ ] **Step 4: Docker nginx 통합 확인** (선택)

```bash
# 상위 프로젝트에서 (front-e2e-scheduler 루트)
cp -r dashboard/dist/* <nginx-volume-path>/
```
`http://localhost:8080` 에서 빌드 결과 확인

- [ ] **Step 5: 최종 커밋**

```bash
git add .
git commit -m "style: E2E 대시보드 Linear 다크 테마 리디자인 완료"
```

---

## Verification Summary

| 검증 항목 | 명령 | 기대 결과 |
|-----------|------|-----------|
| 단위 테스트 | `cd dashboard && pnpm test` | All 9 tests pass |
| 타입 체크 | `cd dashboard && pnpm build` | TypeScript errors 0 |
| 시각 검증 | `pnpm dev` → localhost:5173 | Linear 다크 디자인 적용됨 |
