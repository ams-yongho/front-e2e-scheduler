import { render, screen } from '@testing-library/react';
import { ProjectTile } from '../ProjectTile';
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

it('renders failed project summary metrics', () => {
  render(
    <ProjectTile
      name="biz-admin"
      registered={['e2e']}
      e2eLatest={baseResult}
      e2eTrend={[100, 53]}
      unitLatest={null}
      onSelect={() => {}}
    />,
  );

  expect(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ })).toBeInTheDocument();
  expect(screen.getByText('biz-admin')).toBeInTheDocument();
  expect(screen.getAllByText('실패')[0]).toBeInTheDocument();
  expect(screen.getByText('148/277')).toBeInTheDocument();
  expect(screen.getByText(/43초/)).toBeInTheDocument();
  expect(screen.getByText('2026-05-12')).toBeInTheDocument();
});

it('renders passed state with success badge', () => {
  render(
    <ProjectTile
      name="biz-admin"
      registered={['e2e']}
      e2eLatest={{ ...baseResult, status: 'passed', passed: 277, failed: 0 }}
      e2eTrend={[100]}
      unitLatest={null}
      onSelect={() => {}}
    />,
  );

  expect(screen.getByText('통과')).toBeInTheDocument();
  expect(screen.getByText('277/277')).toBeInTheDocument();
});

it('renders no-data state without latest result', () => {
  render(
    <ProjectTile
      name="biz-admin"
      registered={['e2e']}
      e2eLatest={null}
      e2eTrend={[]}
      unitLatest={null}
      onSelect={() => {}}
    />,
  );

  expect(screen.getByText('데이터 없음')).toBeInTheDocument();
  expect(screen.getByText('결과 없음')).toBeInTheDocument();
});
