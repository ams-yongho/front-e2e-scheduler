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

it('renders date, status, passed, duration, pass rate', () => {
  render(<UnitHistoryTable results={results} />);
  expect(screen.getByText('2026-05-09')).toBeInTheDocument();
  expect(screen.getAllByText('통과').length).toBeGreaterThan(0);
  expect(screen.getByText('48')).toBeInTheDocument();
  expect(screen.getByText('96%')).toBeInTheDocument();
});

it('shows 실패 status when failed > 0', () => {
  const failed = mkUnit('2026-05-07', 45, 50);
  render(<UnitHistoryTable results={[failed]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('shows empty message when no results', () => {
  render(<UnitHistoryTable results={[]} />);
  expect(screen.getByText('실행 기록 없음')).toBeInTheDocument();
});
