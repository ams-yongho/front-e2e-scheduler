import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectCard } from '../ProjectCard';
import type { TestResult, UnitTestResult } from '../../types';

const failedResult: TestResult = {
  project: 'ca-admin',
  date: '2026-05-09',
  status: 'failed',
  total: 87,
  passed: 82,
  failed: 3,
  flaky: 2,
  skipped: 0,
  duration: '5분 23초',
  browsers: [
    { id: 'chromium', name: 'Chromium', icon: 'CR', passed: 28, failed: 1, flaky: 0, skipped: 0, total: 29 },
  ],
  failures: [
    {
      test: '결제 완료 플로우',
      file: 'checkout.spec.ts',
      line: 84,
      error: 'err',
      browser: 'webkit',
      steps: ['a', 'b'],
      failedStepIdx: 1,
      attachments: [],
    },
  ],
  flakyTests: [{ test: '토큰 갱신', file: 'auth.spec.ts', line: 28, retries: 1 }],
  slowTests: [{ test: '느린 임포트', file: 'import.spec.ts', durationMs: 22000 }],
};

const passedResult: TestResult = {
  ...failedResult,
  status: 'passed',
  passed: 87,
  failed: 0,
  flaky: 0,
  failures: [],
  flakyTests: [],
};

const unitResult: UnitTestResult = {
  project: 'ca-admin',
  type: 'unit',
  date: '2026-05-09',
  status: 'passed',
  framework: 'vitest',
  total: 50,
  passed: 48,
  failed: 2,
  skipped: 0,
  duration: '1분 10초',
  failures: [
    { test: '유닛 실패 테스트', file: 'unit.test.ts', line: 12, error: 'AssertionError' },
  ],
  slowTests: [],
};

const defaultProps = {
  projectName: 'ca-admin',
  registered: ['e2e'] as ('e2e' | 'unit')[],
  e2eLatest: failedResult,
  e2eHistory: [],
  e2eTrend: [100, 95],
  unitLatest: null,
  unitHistory: [],
};

it('displays project name and status badge', () => {
  render(<ProjectCard {...defaultProps} />);
  expect(screen.getByText('ca-admin')).toBeInTheDocument();
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('shows pass rate, failed count, flaky count', () => {
  render(<ProjectCard {...defaultProps} />);
  // 82/87 = 94.25 → rounded 94
  expect(screen.getByText('94')).toBeInTheDocument();
  expect(screen.getByText('% · 82/87')).toBeInTheDocument();
  expect(screen.getByText('5분 23초')).toBeInTheDocument();
});

it('shows 통과 badge and hides failure section when passed', () => {
  render(<ProjectCard {...defaultProps} e2eLatest={passedResult} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
  expect(screen.queryByText('실패 상세')).not.toBeInTheDocument();
});

it('renders 데이터 없음 when e2eLatest is null', () => {
  render(<ProjectCard {...defaultProps} e2eLatest={null} e2eTrend={[]} />);
  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
});

it('shows failure section, flaky section, slow section for failed result', () => {
  render(<ProjectCard {...defaultProps} />);
  expect(screen.getByText('실패 상세')).toBeInTheDocument();
  expect(screen.getByText(/Flaky 테스트/)).toBeInTheDocument();
  expect(screen.getByText('가장 느린 테스트')).toBeInTheDocument();
});

it('Unit 탭이 등록된 경우 클릭하면 UnitDetail이 표시된다', async () => {
  render(
    <ProjectCard
      {...defaultProps}
      registered={['e2e', 'unit']}
      unitLatest={unitResult}
      unitHistory={[]}
    />
  );
  const unitTab = screen.getByRole('tab', { name: 'Unit' });
  await userEvent.click(unitTab);
  expect(screen.getByText('% · 48/50')).toBeInTheDocument();
  expect(screen.getByText('vitest')).toBeInTheDocument();
});

it('Unit 탭이 미등록인 경우 비활성화된다', () => {
  render(<ProjectCard {...defaultProps} registered={['e2e']} />);
  const unitTab = screen.getByRole('tab', { name: 'Unit' });
  expect(unitTab).toBeDisabled();
});
