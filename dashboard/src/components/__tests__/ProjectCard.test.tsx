import { render, screen } from '@testing-library/react';
import { ProjectCard } from '../ProjectCard';
import type { TestResult } from '../../types';

const failedResult: TestResult = {
  project: 'ca-admin', date: '2026-05-08', status: 'failed',
  total: 50, passed: 47, failed: 3, skipped: 0, duration: '3분 42초',
  failures: [
    {
      test: '결제 완료 플로우', file: 'checkout.spec.ts', line: 84, error: 'err',
      browser: 'chromium', steps: [], failedStepIdx: -1, attachments: [],
    },
  ],
};

const passedResult: TestResult = {
  project: 'ca-admin', date: '2026-05-08', status: 'passed',
  total: 50, passed: 50, failed: 0, skipped: 0, duration: '2분 15초', failures: [],
};

it('displays project name', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} />);
  expect(screen.getByText('ca-admin')).toBeInTheDocument();
});

it('shows 실패 badge and failure count when failed', () => {
  render(<ProjectCard projectName="ca-admin" latest={failedResult} history={[failedResult]} />);
  expect(screen.getByText('실패')).toBeInTheDocument();
  expect(screen.getByText(/3건 실패/)).toBeInTheDocument();
});

it('shows 통과 badge when all passed', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[passedResult]} />);
  expect(screen.getByText('통과')).toBeInTheDocument();
});

it('shows duration', () => {
  render(<ProjectCard projectName="ca-admin" latest={passedResult} history={[]} />);
  expect(screen.getByText('2분 15초')).toBeInTheDocument();
});

it('renders loading state when no latest result', () => {
  render(<ProjectCard projectName="ca-admin" latest={null} history={[]} />);
  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
});
