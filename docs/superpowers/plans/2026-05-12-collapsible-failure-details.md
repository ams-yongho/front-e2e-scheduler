# Collapsible Failure Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 실패 상세가 길게 늘어지지 않도록 실패 항목을 기본 접힘 상태로 보여주고, 필요할 때만 스크린샷, 단계, 에러 전문, 첨부 정보를 펼쳐 보게 만든다.

**Architecture:** `FailureList` 안에서 각 실패 항목을 독립적인 `Collapsible` 카드로 전환한다. 접힌 상태에서는 성공 카드의 밀도와 비슷하게 테스트명, 파일 위치, 브라우저, 에러 첫 줄 요약, 첨부 요약만 노출하고, 펼친 상태에서는 기존 상세 UI를 그대로 재사용해 정보 손실을 없앤다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Base UI `Collapsible`, lucide-react `ChevronDown`.

---

## Design Proposal

실패 상세 섹션은 지금처럼 프로젝트 카드 내부 하단에 둔다. 다만 각 실패는 다음 두 상태를 갖는다.

**Collapsed state**
- 좌측: 빨간 실패 아이콘 `x`, 테스트명.
- 중간: 에러 첫 줄 요약. 예: `locator.click: strict mode violation...`
- 우측: `file:line`, 브라우저 pill, 첨부 pill, chevron.
- 행 높이는 약 56-64px로 고정감 있게 유지한다.
- 실패가 여러 개여도 성공 섹션처럼 목록을 빠르게 훑을 수 있게 한다.

**Expanded state**
- 기존의 `StepTrail`, 스크린샷 플레이스홀더, 에러 전문 `pre`, 첨부 chip 영역을 접힌 행 아래에 표시한다.
- 상세 영역은 현재 빨간 tint 배경을 유지하되, 접힌 행과 시각적으로 연결되도록 같은 카드 안에 배치한다.
- 펼쳐진 항목만 길어지므로 18개 실패가 있어도 화면 전체가 곧바로 길게 밀리지 않는다.

**Default behavior**
- 실패 항목은 기본적으로 모두 접힌 상태다.
- 사용자가 chevron 행을 누르면 해당 항목만 펼쳐진다.
- 한 번에 여러 항목을 펼칠 수 있게 둔다. 실패 비교와 디버깅에 유리하고 상태 관리가 단순하다.

## File Structure

- Modify: `dashboard/src/components/FailureList.tsx`
  - `FailureItem`을 `Collapsible` 기반으로 변경한다.
  - `summarizeError(error: string)` helper를 같은 파일에 둔다.
  - `AttachmentSummary` 또는 `formatAttachmentSummary(attachments)` helper를 같은 파일에 둔다.
  - 기존 `ScreenshotPlaceholder`와 `iconFor`는 그대로 재사용한다.
- Modify: `dashboard/src/components/__tests__/FailureList.test.tsx`
  - 기본 접힘 상태에서 요약만 보이는지 검증한다.
  - 클릭하면 상세가 펼쳐지고, 다시 클릭하면 접히는지 검증한다.
  - 첨부 chip과 step trail은 펼쳐진 뒤 보이는지 검증한다.
- No change: `dashboard/src/components/ProjectCard.tsx`
  - `Section title="실패 상세"` 구조는 유지한다.
  - 카운트 badge는 현재처럼 실패 총 건수만 표시한다.
- No change: `dashboard/src/components/ui/collapsible.tsx`
  - 이미 Base UI wrapper가 있으므로 새 UI primitive를 만들지 않는다.

---

### Task 1: Add Collapsed Failure Summary Tests

**Files:**
- Modify: `dashboard/src/components/__tests__/FailureList.test.tsx`

- [ ] **Step 1: Replace the test file with collapsed and expanded behavior tests**

Use this complete file content:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  {
    test: '결제 완료 플로우',
    file: 'checkout.spec.ts',
    line: 84,
    error: [
      'Error: Expected visible',
      '',
      'Locator: getByText("결제완료")',
      'Expected: visible',
      'Received: hidden',
    ].join('\n'),
    browser: 'webkit',
    steps: ['login', 'navigate /cart', 'click submit'],
    failedStepIdx: 2,
    attachments: [
      { name: 'screenshot', contentType: 'image/png' },
      { name: 'trace', contentType: 'application/zip' },
    ],
  },
];

it('renders a compact collapsed failure summary by default', () => {
  render(<FailureList failures={failures} />);

  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('checkout.spec.ts:84')).toBeInTheDocument();
  expect(screen.getByText('webkit')).toBeInTheDocument();
  expect(screen.getByText('Error: Expected visible')).toBeInTheDocument();
  expect(screen.getByText('첨부 2개')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  expect(screen.queryByText('login')).not.toBeInTheDocument();
  expect(screen.queryByText('Locator: getByText("결제완료")')).not.toBeInTheDocument();
  expect(screen.queryByText(/^🔍 trace$/)).not.toBeInTheDocument();
});

it('expands and collapses a failure detail when the summary row is clicked', async () => {
  const user = userEvent.setup();
  render(<FailureList failures={failures} />);

  const trigger = screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ });

  await user.click(trigger);

  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate /cart')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
  expect(screen.getByText(/Locator: getByText/)).toBeInTheDocument();
  expect(screen.getAllByText(/^📷 screenshot$/)).toHaveLength(2);
  expect(screen.getByText(/^🔍 trace$/)).toBeInTheDocument();

  await user.click(trigger);

  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('login')).not.toBeInTheDocument();
  expect(screen.queryByText(/Locator: getByText/)).not.toBeInTheDocument();
});

it('truncates a very long error summary without changing the expanded error body', async () => {
  const user = userEvent.setup();
  const longFailure: TestFailure = {
    ...failures[0],
    error: `${'A'.repeat(180)}\nsecond line remains in expanded body`,
  };

  render(<FailureList failures={[longFailure]} />);

  expect(screen.getByText(`${'A'.repeat(137)}...`)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ }));

  expect(screen.getByText(/second line remains in expanded body/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir dashboard test -- FailureList
```

Expected: FAIL. The first failure should show that `첨부 2개` or the accessible trigger name cannot be found, because the component still renders all failure details immediately and has no collapsible trigger.

- [ ] **Step 3: Commit the failing test**

```bash
git add dashboard/src/components/__tests__/FailureList.test.tsx
git commit -m "test: 실패 상세 접힘 동작 테스트 추가"
```

---

### Task 2: Convert Failure Items to Collapsible Summary Rows

**Files:**
- Modify: `dashboard/src/components/FailureList.tsx`

- [ ] **Step 1: Replace `FailureList.tsx` with the collapsible implementation**

Use this complete file content:

```tsx
import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Attachment, TestFailure } from '../types';
import { StepTrail } from './StepTrail';

type Props = {
  failures: TestFailure[];
};

const ERROR_SUMMARY_LIMIT = 140;

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {failures.map((f, i) => (
        <FailureItem key={`${f.file}:${f.line}:${f.test}:${i}`} failure={f} />
      ))}
    </div>
  );
}

function FailureItem({ failure: f }: { failure: TestFailure }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeError(f.error);
  const attachmentSummary = formatAttachmentSummary(f.attachments);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        style={{
          borderRadius: 8,
          background: open ? 'rgba(229, 72, 77, 0.045)' : 'rgba(229, 72, 77, 0.025)',
          border: open ? '1px solid rgba(229, 72, 77, 0.16)' : '1px solid rgba(229, 72, 77, 0.10)',
          overflow: 'hidden',
        }}
      >
        <CollapsibleTrigger
          aria-label={`${f.test} 실패 상세 ${open ? '접기' : '펼치기'}`}
          style={{
            width: '100%',
            border: 0,
            background: 'transparent',
            color: 'inherit',
            padding: '12px 14px',
            cursor: 'pointer',
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.4fr) auto auto auto',
            gap: 12,
            alignItems: 'center',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <X style={{ width: 14, height: 14, color: 'var(--danger)', flex: '0 0 auto' }} />
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: 0,
              }}
            >
              {f.test}
            </span>
          </div>

          <div
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-muted)',
              letterSpacing: 0,
            }}
          >
            {summary}
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-faint)',
              whiteSpace: 'nowrap',
            }}
          >
            {f.file}:{f.line}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill>{f.browser}</Pill>
            {attachmentSummary && <Pill tone="accent">{attachmentSummary}</Pill>}
          </div>

          <ChevronDown
            style={{
              width: 14,
              height: 14,
              color: 'var(--text-faint)',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div style={{ borderTop: '1px solid rgba(229, 72, 77, 0.10)', padding: '0 14px 14px' }}>
            <StepTrail steps={f.steps} failedStepIdx={f.failedStepIdx} />

            <div
              style={{
                marginTop: 12,
                marginLeft: 24,
                display: 'grid',
                gridTemplateColumns: '132px minmax(0, 1fr)',
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
                  letterSpacing: 0,
                  overflow: 'auto',
                  maxHeight: 160,
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
                    key={`${a.name}:${i}`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      color: 'var(--accent-hover)',
                      padding: '4px 9px',
                      borderRadius: 4,
                      background: 'rgba(94,106,210,0.08)',
                      border: '1px solid rgba(94,106,210,0.14)',
                      letterSpacing: 0,
                    }}
                  >
                    {iconFor(a.name)} {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <span
      style={{
        background: tone === 'accent' ? 'rgba(94,106,210,0.08)' : 'var(--surface-3)',
        color: tone === 'accent' ? 'var(--accent-hover)' : 'var(--text-secondary)',
        padding: '2px 8px',
        fontSize: 10,
        borderRadius: 999,
        fontWeight: 500,
        letterSpacing: 0,
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function summarizeError(error: string): string {
  const firstLine = error
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return '에러 메시지 없음';
  if (firstLine.length <= ERROR_SUMMARY_LIMIT) return firstLine;
  return `${firstLine.slice(0, ERROR_SUMMARY_LIMIT - 3)}...`;
}

function formatAttachmentSummary(attachments: Attachment[]): string | null {
  if (attachments.length === 0) return null;
  return `첨부 ${attachments.length}개`;
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
          letterSpacing: 0,
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

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
pnpm --dir dashboard test -- FailureList
```

Expected: PASS. All four `FailureList` tests pass.

- [ ] **Step 3: Check TypeScript build**

Run:

```bash
pnpm --dir dashboard build
```

Expected: PASS. `tsc -b && vite build` completes without type or bundling errors.

- [ ] **Step 4: Commit the implementation**

```bash
git add dashboard/src/components/FailureList.tsx
git commit -m "feat: 실패 상세 접기 UI 추가"
```

---

### Task 3: Browser Visual Verification

**Files:**
- No source change expected unless the visual check reveals layout issues.

- [ ] **Step 1: Start the dashboard dev server**

Run:

```bash
pnpm --dir dashboard dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 2: Open the dashboard in the browser**

Use the Browser plugin or Playwright to open the Vite URL from Step 1.

Expected: The dashboard loads without console errors.

- [ ] **Step 3: Verify collapsed failure rows**

Check a project with failures.

Expected:
- The `실패 상세` section shows compact rows.
- Each row shows test name, first-line error summary, file and line, browser, attachment count, and chevron.
- The first viewport no longer shows multiple full error bodies at once.
- Text stays inside its row at desktop width.

- [ ] **Step 4: Verify expanded failure details**

Click one collapsed failure row.

Expected:
- The chevron rotates upward.
- The selected row expands in place.
- The failed step trail, screenshot placeholder, full error body, and attachment chips appear.
- Other failure rows remain collapsed.
- The error body scrolls inside the `pre` area instead of stretching the whole card.

- [ ] **Step 5: Verify narrow viewport behavior**

Resize to a narrow viewport around 390px wide.

Expected:
- No text overlaps.
- The summary row remains readable.
- If the five-column grid is too tight, change the trigger style to stack by adding `gridTemplateColumns: '1fr'` under an inline responsive fallback is not possible, so move the styles into CSS classes in `dashboard/src/index.css`:

```css
.failure-summary-trigger {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 12px 14px;
  cursor: pointer;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.4fr) auto auto auto;
  gap: 12px;
  align-items: center;
  text-align: left;
}

@media (max-width: 720px) {
  .failure-summary-trigger {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
```

Then set the trigger in `FailureList.tsx` to:

```tsx
<CollapsibleTrigger
  aria-label={`${f.test} 실패 상세 ${open ? '접기' : '펼치기'}`}
  className="failure-summary-trigger"
>
```

- [ ] **Step 6: Run final verification commands**

Run:

```bash
pnpm --dir dashboard test
pnpm --dir dashboard build
```

Expected: Both commands pass.

- [ ] **Step 7: Commit visual polish only if Step 5 required source changes**

If Step 5 required CSS or JSX changes, run:

```bash
git add dashboard/src/components/FailureList.tsx dashboard/src/index.css
git commit -m "refactor: 실패 요약 반응형 레이아웃 정리"
```

If Step 5 did not require changes, skip this commit.

---

## Self-Review

**Spec coverage:** The plan addresses the long failure-detail problem by making each failure collapsible. The collapsed state keeps a success-like summary with test name, status, location, browser, and a concise error summary. Expanded state preserves existing debugging details.

**Placeholder scan:** The plan uses concrete paths, commands, expected results, and complete code blocks for every code-changing step.

**Type consistency:** `TestFailure`, `Attachment`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, `StepTrail`, `summarizeError`, and `formatAttachmentSummary` are used consistently across the test and implementation tasks.
