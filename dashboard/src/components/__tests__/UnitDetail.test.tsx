import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitDetail } from '../UnitDetail';
import type { UnitTestResult } from '../../types';

const mkUnit = (overrides: Partial<UnitTestResult> = {}): UnitTestResult => ({
  project: 'ca-admin', type: 'unit', date: '2026-05-09', status: 'passed',
  framework: 'vitest', total: 1259, passed: 1259, failed: 0, skipped: 0,
  duration: '2분 24초', failures: [], slowTests: [], ...overrides,
});

it('renders "유닛테스트 결과가 없습니다" when latest is null', () => {
  render(<UnitDetail latest={null} history={[]} unitTrend={[]} />);
  expect(screen.getByText('유닛테스트 결과가 없습니다.')).toBeInTheDocument();
});

it('renders framework badge and date', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[100]} />);
  expect(screen.getByText('vitest')).toBeInTheDocument();
  expect(screen.getByText('2026-05-09')).toBeInTheDocument();
});

it('renders 통과 badge when all passed', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('renders 실패 badge when failed > 0', () => {
  render(<UnitDetail latest={mkUnit({ status: 'failed', failed: 5, passed: 1254 })} history={[]} unitTrend={[]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('renders pass rate stats', () => {
  render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[]} />);
  expect(screen.getByText('100')).toBeInTheDocument();
  expect(screen.getByText('% · 1259/1259')).toBeInTheDocument();
  expect(screen.getByText('2분 24초')).toBeInTheDocument();
});

it('renders failure section when failures exist', () => {
  const latest = mkUnit({
    status: 'failed', failed: 1, passed: 1258,
    failures: [{ test: '유닛 실패 테스트', file: 'unit.test.ts', line: 12, error: 'AssertionError' }],
  });
  render(<UnitDetail latest={latest} history={[]} unitTrend={[]} />);
  expect(screen.getByText('실패 목록')).toBeInTheDocument();
  expect(screen.getByText('유닛 실패 테스트')).toBeInTheDocument();
  expect(screen.getByText(/AssertionError/)).toBeInTheDocument();
});

it('renders slow tests section when slowTests exist', () => {
  const latest = mkUnit({
    slowTests: [{ test: 'PvCfr 느린 테스트', file: 'PvCfr.test.tsx', durationMs: 1778 }],
  });
  render(<UnitDetail latest={latest} history={[]} unitTrend={[]} />);
  expect(screen.getByText('느린 테스트')).toBeInTheDocument();
  expect(screen.getByText('PvCfr 느린 테스트')).toBeInTheDocument();
  expect(screen.getByText('1.8s')).toBeInTheDocument();
});

it('renders history toggle that expands on click', async () => {
  const history = [mkUnit(), mkUnit({ date: '2026-05-08' })];
  render(<UnitDetail latest={mkUnit()} history={history} unitTrend={[100, 100]} />);
  const toggle = screen.getByRole('button', { name: /30일 히스토리/ });
  expect(toggle).toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getByText('2026-05-08')).toBeInTheDocument();
});

it('renders sparkline SVG when unitTrend has data', () => {
  const { container } = render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[90, 95, 100]} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
});

it('does not render sparkline when unitTrend is empty', () => {
  const { container } = render(<UnitDetail latest={mkUnit()} history={[]} unitTrend={[]} />);
  expect(container.querySelector('svg')).toBeNull();
});
