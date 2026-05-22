# Unit 테스트 시각화 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UnitDetail 컴포넌트를 E2E 수준의 시각화(Sparkline 트렌드, Stats 그리드, Section 패턴, 접이식 히스토리 테이블)로 강화한다.

**Architecture:** `computeUnitTrend`를 추가해 Unit 히스토리에서 통과율 sparkline 데이터를 생성한다. `UnitDetail`을 `UnitDetailHeader + UnitStats + Section(실패) + Section(느린 테스트) + UnitHistoryToggle` 구조로 재작성한다. `SlowTestsList`와 `Section` 컴포넌트는 E2E와 동일하게 재사용한다.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, lucide-react (ChevronDown), shadcn/ui Collapsible

---

## File Structure

| 파일 | 역할 |
|------|------|
| `dashboard/src/lib/trend.ts` | `computeUnitTrend` 추가 |
| `dashboard/src/types.ts` | 타입 변경 없음 (읽기 전용) |
| `dashboard/src/App.tsx` | `ProjectData`에 `unitTrend: number[]` 추가, 계산 |
| `dashboard/src/components/ProjectCard.tsx` | `unitTrend` prop 추가하여 `UnitDetail`에 전달 |
| `dashboard/src/components/UnitDetail.tsx` | 전면 재작성 |
| `dashboard/src/components/UnitHistoryTable.tsx` | 신규: Unit용 히스토리 테이블 |
| `dashboard/src/__tests__/trend.test.ts` | `computeUnitTrend` 테스트 추가 |
| `dashboard/src/components/__tests__/UnitDetail.test.tsx` | 신규: UnitDetail 컴포넌트 테스트 |

---

## Task 1: `computeUnitTrend` 추가

**Files:**
- Modify: `dashboard/src/lib/trend.ts`
- Modify: `dashboard/src/__tests__/trend.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/src/__tests__/trend.test.ts` 하단에 추가:

```typescript
import { computeTrend, computeUnitTrend } from '../lib/trend';
import type { UnitTestResult } from '../types';

const mkUnit = (date: string, passed: number, total: number): UnitTestResult => ({
  project: 'p',
  type: 'unit',
  date,
  status: passed === total ? 'passed' : 'failed',
  framework: 'vitest',
  total,
  passed,
  failed: total - passed,
  skipped: 0,
  duration: '0초',
  failures: [],
  slowTests: [],
});

describe('computeUnitTrend', () => {
  it('returns pass-rate percentages in chronological order (oldest first)', () => {
    const r = computeUnitTrend([
      mkUnit('2026-05-09', 9, 10),
      mkUnit('2026-05-08', 10, 10),
      mkUnit('2026-05-07', 8, 10),
    ]);
    expect(r).toEqual([80, 100, 90]);
  });

  it('returns empty array when no results', () => {
    expect(computeUnitTrend([])).toEqual([]);
  });

  it('handles total=0 as 100', () => {
    expect(computeUnitTrend([mkUnit('2026-05-09', 0, 0)])).toEqual([100]);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose trend
```

Expected: `computeUnitTrend` is not a function (또는 import 실패)

- [ ] **Step 3: `computeUnitTrend` 구현**

`dashboard/src/lib/trend.ts` 전체 교체:

```typescript
import type { TestResult, UnitTestResult } from '../types';

export function computeTrend(results: TestResult[]): number[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => (r.total > 0 ? Math.round((r.passed / r.total) * 100) : 100));
}

export function computeUnitTrend(results: UnitTestResult[]): number[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => (r.total > 0 ? Math.round((r.passed / r.total) * 100) : 100));
}
```

- [ ] **Step 4: 통과 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose trend
```

Expected: 모든 `computeTrend` + `computeUnitTrend` 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/lib/trend.ts dashboard/src/__tests__/trend.test.ts
git commit -m "feat: add computeUnitTrend for unit test sparkline trend"
```

---

## Task 2: `UnitHistoryTable` 컴포넌트 신규 작성

`HistoryTable.tsx`가 `TestResult[]`만 받아 재사용이 불가하므로 Unit용 테이블을 별도로 만든다.

**Files:**
- Create: `dashboard/src/components/UnitHistoryTable.tsx`
- Create: `dashboard/src/components/__tests__/UnitHistoryTable.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/src/components/__tests__/UnitHistoryTable.test.tsx` 생성:

```typescript
import { render, screen } from '@testing-library/react';
import { UnitHistoryTable } from '../UnitHistoryTable';
import type { UnitTestResult } from '../../types';

const mkUnit = (date: string, passed: number, total: number): UnitTestResult => ({
  project: 'p',
  type: 'unit',
  date,
  status: passed === total ? 'passed' : 'failed',
  framework: 'vitest',
  total,
  passed,
  failed: total - passed,
  skipped: 0,
  duration: '1분 10초',
  failures: [],
  slowTests: [],
});

const results = [
  mkUnit('2026-05-09', 48, 50),
  mkUnit('2026-05-08', 50, 50),
];

it('renders date, status, passed/total, duration, pass rate', () => {
  render(<UnitHistoryTable results={results} />);
  expect(screen.getByText('2026-05-09')).toBeInTheDocument();
  expect(screen.getAllByText('통과').length).toBeGreaterThan(0);
  expect(screen.getByText('48')).toBeInTheDocument();
  expect(screen.getByText('96%')).toBeInTheDocument();
});

it('shows 실패 status in danger color when failed > 0', () => {
  const failed = mkUnit('2026-05-07', 45, 50);
  render(<UnitHistoryTable results={[failed]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('shows empty message when no results', () => {
  render(<UnitHistoryTable results={[]} />);
  expect(screen.getByText('실행 기록 없음')).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose UnitHistoryTable
```

Expected: Cannot find module `../UnitHistoryTable`

- [ ] **Step 3: 컴포넌트 구현**

`dashboard/src/components/UnitHistoryTable.tsx` 생성:

```typescript
import type { UnitTestResult } from '../types';

type Props = {
  results: UnitTestResult[];
};

export function UnitHistoryTable({ results }: Props) {
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
          {['날짜', '상태', '통과 수', '실패 수', '소요시간', '통과율'].map(h => (
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

- [ ] **Step 4: 통과 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose UnitHistoryTable
```

Expected: 3개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/UnitHistoryTable.tsx dashboard/src/components/__tests__/UnitHistoryTable.test.tsx
git commit -m "feat: add UnitHistoryTable component for unit test history display"
```

---

## Task 3: `UnitDetail` 전면 재작성

현재 `UnitDetail.tsx`는 plain text 목록이다. E2E와 동일한 수준(뱃지 + sparkline, stats 그리드, Section 패턴, SlowTestsList, 접이식 히스토리)으로 재작성한다.

**Files:**
- Modify: `dashboard/src/components/UnitDetail.tsx`
- Create: `dashboard/src/components/__tests__/UnitDetail.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/src/components/__tests__/UnitDetail.test.tsx` 생성:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitDetail } from '../UnitDetail';
import type { UnitTestResult } from '../../types';

const mkUnit = (overrides: Partial<UnitTestResult> = {}): UnitTestResult => ({
  project: 'ca-admin',
  type: 'unit',
  date: '2026-05-09',
  status: 'passed',
  framework: 'vitest',
  total: 1259,
  passed: 1259,
  failed: 0,
  skipped: 0,
  duration: '2분 24초',
  failures: [],
  slowTests: [],
  ...overrides,
});

it('renders "유닛테스트 결과가 없습니다" when latest is null', () => {
  render(<UnitDetail latest={null} history={[]} unitTrend={[]} />);
  expect(screen.getByText('유닛테스트 결과가 없습니다.')).toBeInTheDocument();
});

it('renders framework badge and date', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[100, 100]} />);
  expect(screen.getByText('vitest')).toBeInTheDocument();
  expect(screen.getByText('2026-05-09')).toBeInTheDocument();
});

it('renders 통과 status badge when all passed', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('renders 실패 status badge when failed > 0', () => {
  render(<UnitDetail latest={mkUnit({ status: 'failed', failed: 5, passed: 1254 })} history={[]} unitTrend={[]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('renders pass rate stats', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[]} />);
  expect(screen.getByText('100')).toBeInTheDocument();
  expect(screen.getByText('% · 1259/1259')).toBeInTheDocument();
  expect(screen.getByText('2분 24초')).toBeInTheDocument();
});

it('renders failure section with test name when failures exist', () => {
  const latest = mkUnit({
    status: 'failed',
    failed: 1,
    passed: 1258,
    failures: [{ test: '유닛 실패 테스트', file: 'unit.test.ts', line: 12, error: 'AssertionError' }],
  });
  render(<UnitDetail latest={latest} history={[]} unitTrend={[]} />);
  expect(screen.getByText('실패 목록')).toBeInTheDocument();
  expect(screen.getByText('유닛 실패 테스트')).toBeInTheDocument();
  expect(screen.getByText(/AssertionError/)).toBeInTheDocument();
});

it('renders slow tests section using SlowTestsList when slowTests exist', () => {
  const latest = mkUnit({
    slowTests: [
      { test: 'PvCfrRequestForm 느린 테스트', file: 'PvCfrRequestForm.test.tsx', durationMs: 1778 },
    ],
  });
  render(<UnitDetail latest={latest} history={[]} unitTrend={[]} />);
  expect(screen.getByText('느린 테스트')).toBeInTheDocument();
  expect(screen.getByText('PvCfrRequestForm 느린 테스트')).toBeInTheDocument();
  expect(screen.getByText('1.8s')).toBeInTheDocument();
});

it('renders history toggle when history has entries', async () => {
  const history = [mkUnit(), mkUnit({ date: '2026-05-08' })];
  render(<UnitDetail latest={mkUnit()} history={history} unitTrend={[100, 100]} />);
  const toggle = screen.getByRole('button', { name: /30일 히스토리/ });
  expect(toggle).toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getByText('2026-05-08')).toBeInTheDocument();
});

it('renders sparkline when unitTrend has data', () => {
  const { container } = render(
    <UnitDetail latest={mkUnit()} history={[]} unitTrend={[90, 95, 100]} />
  );
  expect(container.querySelector('svg')).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose UnitDetail
```

Expected: 다수 실패 (prop 불일치, 없는 DOM 요소 등)

- [ ] **Step 3: `UnitDetail.tsx` 재작성**

`dashboard/src/components/UnitDetail.tsx` 전체 교체:

```typescript
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { UnitTestResult } from '../types';
import { Sparkline } from './Sparkline';
import { SlowTestsList } from './SlowTestsList';
import { UnitHistoryTable } from './UnitHistoryTable';

type Props = {
  latest: UnitTestResult | null;
  history: UnitTestResult[];
  unitTrend: number[];
};

export function UnitDetail({ latest, history, unitTrend }: Props) {
  if (!latest) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        유닛테스트 결과가 없습니다.
      </div>
    );
  }

  const passRate = latest.total > 0 ? (latest.passed / latest.total) * 100 : 0;
  const passRateInt = Math.round(passRate);
  const statusKey: 'failed' | 'passed' = latest.failed > 0 ? 'failed' : 'passed';
  const accent = statusKey === 'failed' ? 'var(--danger)' : 'var(--success)';

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
      <UnitCardHeader latest={latest} statusKey={statusKey} unitTrend={unitTrend} accent={accent} />

      <UnitStats latest={latest} passRate={passRate} passRateInt={passRateInt} />

      {latest.failures.length > 0 && (
        <Section title="실패 목록" count={`${latest.failures.length}건`} variant="danger">
          <FailureList failures={latest.failures} />
        </Section>
      )}

      {latest.slowTests.length > 0 && (
        <Section title="느린 테스트" count={`Top ${latest.slowTests.length}`} variant="default">
          <SlowTestsList tests={latest.slowTests} />
        </Section>
      )}

      {history.length > 0 && <UnitHistoryToggle history={history} />}
    </article>
  );
}

function UnitCardHeader({
  latest,
  statusKey,
  unitTrend,
  accent,
}: {
  latest: UnitTestResult;
  statusKey: 'failed' | 'passed';
  unitTrend: number[];
  accent: string;
}) {
  const badgeText = statusKey === 'failed' ? '실패' : '통과';
  const badgeBg = statusKey === 'failed' ? 'var(--danger-muted)' : 'var(--success-muted)';
  const badgeFg = statusKey === 'failed' ? 'var(--danger)' : 'var(--success)';

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
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: 'var(--surface-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          {latest.framework}
        </span>
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
      </div>
      {unitTrend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Sparkline data={unitTrend} accent={accent} />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--text-faint)',
              letterSpacing: '0.02em',
            }}
          >
            최근 {unitTrend.length}일 통과율
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

function UnitStats({
  latest,
  passRate,
  passRateInt,
}: {
  latest: UnitTestResult;
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
        <Label>실패 수</Label>
        <Value tone={latest.failed > 0 ? 'danger' : 'muted'}>
          {latest.failed}
          <Sub>건</Sub>
        </Value>
      </div>
      <div>
        <Label>스킵</Label>
        <Value tone={latest.skipped > 0 ? 'warning' : 'muted'}>
          {latest.skipped}
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
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'muted'
          ? 'var(--text-faint)'
          : 'var(--text-primary)';
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
    variant === 'danger'
      ? 'var(--danger-muted)'
      : variant === 'warning'
        ? 'var(--warning-muted)'
        : 'var(--surface-3)';
  const countFg =
    variant === 'danger'
      ? 'var(--danger)'
      : variant === 'warning'
        ? 'var(--warning)'
        : 'var(--text-muted)';

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

function FailureList({ failures }: { failures: UnitTestResult['failures'] }) {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, padding: '0 22px 16px' }}>
      {failures.map((f, i) => (
        <li
          key={i}
          style={{
            borderLeft: '3px solid var(--danger)',
            padding: '6px 10px',
            background: 'var(--danger-muted)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontWeight: 600 }}>{f.test}</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {f.file}{f.line ? `:${f.line}` : ''}
          </div>
          {f.error && (
            <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 11 }}>
              {f.error}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}

function UnitHistoryToggle({ history }: { history: UnitTestResult[] }) {
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
          <UnitHistoryTable results={history} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 4: 통과 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose UnitDetail
```

Expected: 9개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add dashboard/src/components/UnitDetail.tsx dashboard/src/components/__tests__/UnitDetail.test.tsx
git commit -m "feat: revamp UnitDetail with sparkline, stats grid, section layout, history table"
```

---

## Task 4: `App.tsx` + `ProjectCard.tsx` — `unitTrend` 연결

**Files:**
- Modify: `dashboard/src/App.tsx:8-57` — `ProjectData`에 `unitTrend` 추가, `computeUnitTrend` 호출
- Modify: `dashboard/src/components/ProjectCard.tsx:17-66` — `unitTrend` prop 추가, `UnitDetail`에 전달

- [ ] **Step 1: 기존 `ProjectCard` 테스트 실패 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose ProjectCard
```

Expected: 현재는 통과 (아직 변경 전)

- [ ] **Step 2: `App.tsx` 수정 — `ProjectData` 타입 + `computeUnitTrend` 연결**

`dashboard/src/App.tsx` 에서 다음 두 부분을 수정한다.

**import 줄 변경** (6번째 줄):
```typescript
import { computeTrend, computeUnitTrend } from './lib/trend';
```

**`ProjectData` 타입 수정** (11-18번째 줄):
```typescript
export type ProjectData = {
  name: string;
  registered: RegisteredTypes;
  e2eLatest: TestResult | null;
  e2eHistory: TestResult[];
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  unitHistory: UnitTestResult[];
  unitTrend: number[];
};
```

**`projectData` 반환 객체에 `unitTrend` 추가** (49-58번째 줄 내 return 객체):
```typescript
return {
  name,
  registered,
  e2eLatest: e2eResults[0] ?? null,
  e2eHistory: e2eResults,
  e2eTrend: computeTrend(e2eResults),
  unitLatest: unitResults[0] ?? null,
  unitHistory: unitResults,
  unitTrend: computeUnitTrend(unitResults),
};
```

- [ ] **Step 3: `ProjectCard.tsx` 수정 — `unitTrend` prop 추가 및 전달**

`dashboard/src/components/ProjectCard.tsx`에서 `ProjectCardProps` 타입에 `unitTrend` 추가:

```typescript
export type ProjectCardProps = {
  projectName: string;
  registered: ('e2e' | 'unit')[];
  e2eLatest: TestResult | null;
  e2eHistory: TestResult[];
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  unitHistory: UnitTestResult[];
  unitTrend: number[];
};
```

`ProjectCard` 함수 내 destructuring 변경:
```typescript
const { projectName, registered, e2eLatest, e2eHistory, e2eTrend, unitLatest, unitHistory, unitTrend } = props;
```

`UnitDetail` 렌더 부분에 `unitTrend` 전달:
```typescript
registered.includes('unit')
  ? <UnitDetail latest={unitLatest} history={unitHistory} unitTrend={unitTrend} />
  : <NotRegistered label="Unit" />
```

`App.tsx`의 `ProjectCard` 사용부에 `unitTrend` 전달 (159-170번째 줄):
```typescript
<ProjectCard
  projectName={selectedProject.name}
  registered={selectedProject.registered}
  e2eLatest={selectedProject.e2eLatest}
  e2eHistory={selectedProject.e2eHistory}
  e2eTrend={selectedProject.e2eTrend}
  unitLatest={selectedProject.unitLatest}
  unitHistory={selectedProject.unitHistory}
  unitTrend={selectedProject.unitTrend}
/>
```

- [ ] **Step 4: `ProjectCard.test.tsx` 업데이트**

`dashboard/src/components/__tests__/ProjectCard.test.tsx`의 `defaultProps` 객체에 `unitTrend` 추가 (62번째 줄 근처):

```typescript
const defaultProps = {
  projectName: 'ca-admin',
  registered: ['e2e'] as ('e2e' | 'unit')[],
  e2eLatest: failedResult,
  e2eHistory: [],
  e2eTrend: [100, 95],
  unitLatest: null,
  unitHistory: [],
  unitTrend: [],
};
```

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
cd dashboard && pnpm test -- --reporter=verbose
```

Expected: 모든 테스트 통과 (기존 + 신규)

- [ ] **Step 6: 커밋**

```bash
git add dashboard/src/App.tsx dashboard/src/components/ProjectCard.tsx dashboard/src/components/__tests__/ProjectCard.test.tsx
git commit -m "feat: wire unitTrend through App → ProjectCard → UnitDetail"
```

---

## Task 5: 빌드 검증

- [ ] **Step 1: TypeScript 타입 오류 확인**

```bash
cd dashboard && pnpm tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 2: 프로덕션 빌드**

```bash
cd dashboard && pnpm build
```

Expected: `dist/` 빌드 완료, 오류 없음

- [ ] **Step 3: 전체 테스트 최종 확인**

```bash
cd dashboard && pnpm test
```

Expected: 모든 테스트 통과

- [ ] **Step 4: 최종 커밋**

```bash
git add dashboard/dist
git commit -m "feat: build dist for unit test visualization enhancement"
```

---

## Self-Review

### Spec 커버리지
- [x] Sparkline 트렌드 (`unitTrend` + `Sparkline` 컴포넌트 재사용)
- [x] Status 뱃지 (통과/실패)
- [x] Stats 그리드 (통과율 progress bar, 실행시간, 실패 수, 스킵 수)
- [x] Section 패턴으로 실패 목록 스타일 일관성
- [x] `SlowTestsList` 재사용 (bar visualization 포함)
- [x] 접이식 히스토리 테이블 (`UnitHistoryTable`)

### Placeholder 스캔
- 모든 코드 블록 완성됨. TBD/TODO 없음.

### 타입 일관성
- `UnitTestResult['failures']` — `UnitTestFailure[]` (types.ts:65-70)
- `SlowTest[]` — `slowTests` prop type (SlowTestsList.tsx:3)
- `computeUnitTrend(UnitTestResult[]): number[]` — trend.ts에서 정의, App.tsx에서 사용
- `unitTrend: number[]` — ProjectData, ProjectCardProps, UnitDetail Props 모두 일치
