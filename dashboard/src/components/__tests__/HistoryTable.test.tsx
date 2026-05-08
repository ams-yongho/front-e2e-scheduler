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
