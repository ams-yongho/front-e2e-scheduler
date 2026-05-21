import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { TestResult, UnitTestResult } from '../types';
import * as api from '../api';

// ---------------------------------------------------------------------------
// Module-level mock — hoisted by Vitest automatically
// ---------------------------------------------------------------------------
vi.mock('../api', () => ({
  fetchManifest: vi.fn(),
  fetchE2eResult: vi.fn(),
  fetchUnitResult: vi.fn(),
  last30Days: vi.fn(() => ['2026-05-21']),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseE2eResult: TestResult = {
  project: 'biz-admin',
  type: 'e2e',
  date: '2026-05-21',
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

// ---------------------------------------------------------------------------
// Suite 1: navigation tests (grid view + detail view)
// ---------------------------------------------------------------------------

describe('App navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');

    vi.mocked(api.fetchManifest).mockResolvedValue({
      projects: ['biz-admin', 'typist'],
      tests: { 'biz-admin': ['e2e'], typist: ['e2e'] },
      lastUpdated: '2026-05-21T02:47:00.000Z',
    });
    vi.mocked(api.fetchE2eResult).mockImplementation(async (name: string, date: string) =>
      date === '2026-05-21' ? { ...baseE2eResult, project: name } : null,
    );
    vi.mocked(api.fetchUnitResult).mockResolvedValue(null);
    vi.mocked(api.last30Days).mockReturnValue(['2026-05-21']);
  });

  it('shows project grid by default', async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ })).toBeInTheDocument(),
    );
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
});

// ---------------------------------------------------------------------------
// Suite 2: E2E + Unit dual-type loading
// ---------------------------------------------------------------------------

describe('App with e2e + unit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');

    const caAdminE2e: TestResult = {
      project: 'ca-admin',
      type: 'e2e',
      date: '2026-05-21',
      status: 'passed',
      total: 21,
      passed: 19,
      failed: 0,
      flaky: 2,
      skipped: 0,
      duration: '41초',
      browsers: [],
      failures: [],
      flakyTests: [],
      slowTests: [],
    };

    const caAdminUnit: UnitTestResult = {
      project: 'ca-admin',
      type: 'unit',
      framework: 'vitest',
      date: '2026-05-21',
      status: 'passed',
      total: 120,
      passed: 118,
      failed: 0,
      skipped: 2,
      duration: '12초',
      failures: [],
      slowTests: [],
    };

    vi.mocked(api.fetchManifest).mockResolvedValue({
      projects: ['ca-admin'],
      tests: { 'ca-admin': ['e2e', 'unit'] },
      lastUpdated: '2026-05-21T00:00:00.000Z',
    });
    vi.mocked(api.fetchE2eResult).mockResolvedValue(caAdminE2e);
    vi.mocked(api.fetchUnitResult).mockResolvedValue(caAdminUnit);
    vi.mocked(api.last30Days).mockReturnValue(['2026-05-21']);
  });

  it('shows project tile with E2E and Unit rows', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('ca-admin')).toBeInTheDocument());

    // Both type labels are rendered in the tile
    expect(screen.getAllByText('E2E').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unit').length).toBeGreaterThan(0);

    // Stats lines show pass counts
    expect(screen.getByText(/19\/21/)).toBeInTheDocument();
    expect(screen.getByText(/118\/120/)).toBeInTheDocument();
  });
});
