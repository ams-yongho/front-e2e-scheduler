import { render, screen } from '@testing-library/react';
import { ProjectCard } from '../ProjectCard';
import type { TestResult } from '../../types';

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

it('displays project name and status badge', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100, 95]} />);
  expect(screen.getByText('ca-admin')).toBeInTheDocument();
  expect(screen.getByText('실패')).toBeInTheDocument();
});

it('shows pass rate, failed count, flaky count', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100]} />);
  // 82/87 = 94.25 → rounded 94
  expect(screen.getByText('94')).toBeInTheDocument();
  expect(screen.getByText('% · 82/87')).toBeInTheDocument();
  expect(screen.getByText('5분 23초')).toBeInTheDocument();
});

it('shows 통과 badge and hides failure section when passed', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} trend={[100]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
  expect(screen.queryByText('실패 상세')).not.toBeInTheDocument();
});

it('renders 데이터 없음 when latest is null', () => {
  render(<ProjectCard projectName="ca-admin" latest={null} history={[]} trend={[]} />);
  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
});

it('shows failure section, flaky section, slow section for failed result', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[]} trend={[100]} />);
  expect(screen.getByText('실패 상세')).toBeInTheDocument();
  expect(screen.getByText(/Flaky 테스트/)).toBeInTheDocument();
  expect(screen.getByText('가장 느린 테스트')).toBeInTheDocument();
});
