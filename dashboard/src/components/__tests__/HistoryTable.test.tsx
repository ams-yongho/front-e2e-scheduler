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
