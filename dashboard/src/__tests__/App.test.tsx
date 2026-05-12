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
