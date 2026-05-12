# Dashboard Project Grid Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard main page's long project detail list with a 2-column project summary grid and open one selected project in a dedicated detail view.

**Architecture:** `App.tsx` owns data loading and URL query state for the selected project. New `ProjectGrid` and `ProjectTile` components render compact summary tiles, while existing `ProjectCard` remains the detailed project view. Navigation uses `?project=<name>` with `history.pushState` and `popstate`, avoiding a routing dependency.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing dashboard CSS variables and `Sparkline`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `dashboard/src/App.tsx` | Export `ProjectData`, track selected project from URL, render grid or detail, handle back-to-grid navigation. |
| `dashboard/src/components/ProjectGrid.tsx` | Render the 2-column project tile grid and pass tile selection callbacks. |
| `dashboard/src/components/ProjectTile.tsx` | Render compact latest-result summary, status badge, metadata, and sparkline. |
| `dashboard/src/components/__tests__/ProjectGrid.test.tsx` | Verify grid tile rendering and tile selection behavior. |
| `dashboard/src/components/__tests__/ProjectTile.test.tsx` | Verify passed, failed, and no-data tile states. |
| `dashboard/src/__tests__/App.test.tsx` | Verify URL-driven grid/detail routing and back navigation. |

## Task 1: ProjectTile TDD

**Files:**
- Create: `dashboard/src/components/ProjectTile.tsx`
- Create: `dashboard/src/components/__tests__/ProjectTile.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ProjectTile.test.tsx` with tests for failed, passed, and no-data states:

```tsx
import { render, screen } from '@testing-library/react';
import { ProjectTile } from '../ProjectTile';
import type { ProjectData } from '../../App';
import type { TestResult } from '../../types';

const baseResult: TestResult = {
  project: 'biz-admin',
  date: '2026-05-12',
  status: 'failed',
  total: 277,
  passed: 148,
  failed: 7,
  flaky: 0,
  skipped: 122,
  duration: '43초',
  browsers: [],
  failures: [],
  flakyTests: [],
  slowTests: [],
};

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    name: 'biz-admin',
    latest: baseResult,
    history: [baseResult],
    trend: [100, 53],
    ...overrides,
  };
}

it('renders failed project summary metrics', () => {
  render(<ProjectTile project={makeProject()} onSelect={() => {}} />);

  expect(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ })).toBeInTheDocument();
  expect(screen.getByText('biz-admin')).toBeInTheDocument();
  expect(screen.getByText('실패')).toBeInTheDocument();
  expect(screen.getByText('53')).toBeInTheDocument();
  expect(screen.getByText('% · 148/277')).toBeInTheDocument();
  expect(screen.getByText('43초')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
  expect(screen.getByText('2026-05-12')).toBeInTheDocument();
});

it('renders passed state with success badge', () => {
  render(<ProjectTile project={makeProject({ latest: { ...baseResult, status: 'passed', passed: 277, failed: 0 } })} onSelect={() => {}} />);

  expect(screen.getByText('통과')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
});

it('renders no-data state without latest result', () => {
  render(<ProjectTile project={makeProject({ latest: null, history: [], trend: [] })} onSelect={() => {}} />);

  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
  expect(screen.getByText('결과 없음')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test and confirm RED**

Run:

```bash
cd dashboard && pnpm test src/components/__tests__/ProjectTile.test.tsx
```

Expected: FAIL because `ProjectTile` does not exist.

- [ ] **Step 3: Implement ProjectTile**

Create a button-based tile. Use existing CSS variables and `Sparkline`:

```tsx
import type { ProjectData } from '../App';
import { Sparkline } from './Sparkline';

type Props = {
  project: ProjectData;
  onSelect: (projectName: string) => void;
};

export function ProjectTile({ project, onSelect }: Props) {
  const latest = project.latest;
  const statusKey: 'failed' | 'passed' | 'no-data' = !latest ? 'no-data' : latest.failed > 0 ? 'failed' : 'passed';
  const passRate = latest && latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0;
  const accent = statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--surface-4)';

  return (
    <button type="button" aria-label={`${project.name} 프로젝트 상세 보기`} onClick={() => onSelect(project.name)}>
      {/* final implementation keeps this content and adds inline styles */}
      <span>{project.name}</span>
      <span>{statusKey === 'failed' ? '실패' : statusKey === 'passed' ? '통과' : '데이터 없음'}</span>
      {latest ? (
        <>
          <span>{passRate}</span>
          <span>% · {latest.passed}/{latest.total}</span>
          <span>{latest.duration}</span>
          <span>{latest.failed}</span>
          <span>{latest.date}</span>
          <Sparkline data={project.trend} accent={accent} />
        </>
      ) : (
        <span>결과 없음</span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run test and confirm GREEN**

Run:

```bash
cd dashboard && pnpm test src/components/__tests__/ProjectTile.test.tsx
```

Expected: PASS.

## Task 2: ProjectGrid TDD

**Files:**
- Create: `dashboard/src/components/ProjectGrid.tsx`
- Create: `dashboard/src/components/__tests__/ProjectGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ProjectGrid.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectGrid } from '../ProjectGrid';
import type { ProjectData } from '../../App';

const project: ProjectData = {
  name: 'biz-admin',
  latest: null,
  history: [],
  trend: [],
};

it('renders project tiles', () => {
  render(<ProjectGrid projects={[project]} onSelect={() => {}} />);
  expect(screen.getByText('biz-admin')).toBeInTheDocument();
});

it('calls onSelect when a tile is clicked', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<ProjectGrid projects={[project]} onSelect={onSelect} />);

  await user.click(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ }));

  expect(onSelect).toHaveBeenCalledWith('biz-admin');
});
```

- [ ] **Step 2: Run test and confirm RED**

Run:

```bash
cd dashboard && pnpm test src/components/__tests__/ProjectGrid.test.tsx
```

Expected: FAIL because `ProjectGrid` does not exist.

- [ ] **Step 3: Implement ProjectGrid**

Create `ProjectGrid.tsx`:

```tsx
import type { ProjectData } from '../App';
import { ProjectTile } from './ProjectTile';

type Props = {
  projects: ProjectData[];
  onSelect: (projectName: string) => void;
};

export function ProjectGrid({ projects, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
      {projects.map(project => (
        <ProjectTile key={project.name} project={project} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run grid and tile tests**

Run:

```bash
cd dashboard && pnpm test src/components/__tests__/ProjectGrid.test.tsx src/components/__tests__/ProjectTile.test.tsx
```

Expected: PASS.

## Task 3: App URL State TDD

**Files:**
- Modify: `dashboard/src/App.tsx`
- Create: `dashboard/src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing App tests**

Mock `api` and verify main/detail behavior:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import App from '../App';
import type { TestResult } from '../types';

const result: TestResult = {
  project: 'biz-admin',
  date: '2026-05-12',
  status: 'failed',
  total: 10,
  passed: 8,
  failed: 2,
  flaky: 0,
  skipped: 0,
  duration: '12초',
  browsers: [],
  failures: [],
  flakyTests: [],
  slowTests: [],
};

vi.mock('../api', () => ({
  fetchManifest: vi.fn(async () => ({ projects: ['biz-admin', 'typist'], lastUpdated: '2026-05-12T02:47:00.000Z' })),
  fetchResult: vi.fn(async (name: string, date: string) => (date === '2026-05-12' ? { ...result, project: name } : null)),
  last30Days: vi.fn(() => ['2026-05-12']),
}));

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

it('shows project grid by default', async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /typist 프로젝트 상세 보기/ })).toBeInTheDocument();
});

it('opens selected project detail and returns to grid', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole('button', { name: /biz-admin 프로젝트 상세 보기/ }));

  expect(window.location.search).toBe('?project=biz-admin');
  expect(screen.getByRole('button', { name: '프로젝트 목록' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /typist 프로젝트 상세 보기/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '프로젝트 목록' }));

  expect(window.location.search).toBe('');
  expect(screen.getByRole('button', { name: /typist 프로젝트 상세 보기/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run App test and confirm RED**

Run:

```bash
cd dashboard && pnpm test src/__tests__/App.test.tsx
```

Expected: FAIL because App still renders all detail cards and no grid/list button exists.

- [ ] **Step 3: Implement App routing**

Update `App.tsx` to:

- export `ProjectData`
- read selected project from `window.location.search`
- listen for `popstate`
- call `history.pushState` on tile selection
- call `history.pushState` with no `project` when returning to grid
- render `ProjectGrid` on main and one `ProjectCard` in detail

- [ ] **Step 4: Run App test and confirm GREEN**

Run:

```bash
cd dashboard && pnpm test src/__tests__/App.test.tsx
```

Expected: PASS.

## Task 4: Final Verification

**Files:**
- Verify all modified dashboard files.

- [ ] **Step 1: Run full dashboard tests**

Run:

```bash
cd dashboard && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
cd dashboard && pnpm build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Browser check**

Run the dev server and inspect the dashboard:

```bash
cd dashboard && pnpm dev -- --host 127.0.0.1
```

Expected: main page shows a 2-column grid on desktop, tile click switches to one detail page, `프로젝트 목록` returns to grid.
