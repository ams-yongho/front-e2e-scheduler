import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectTile } from '../ProjectTile';
import type { TestResult, UnitTestResult } from '../../types';

const baseUnit: UnitTestResult = {
  project: 'biz-mall',
  type: 'unit',
  date: '2026-05-27',
  status: 'passed',
  framework: 'vitest',
  total: 5,
  passed: 5,
  failed: 0,
  skipped: 0,
  duration: '3초',
  failures: [],
  slowTests: [],
};

describe('ProjectTile unit 상태', () => {
  it('unit status가 error면 수집 실패 + 실패 배지', () => {
    render(
      <ProjectTile
        name="biz-mall"
        registered={['unit']}
        e2eLatest={null}
        e2eTrend={[]}
        unitLatest={{ ...baseUnit, status: 'error', error: 'timeout', passed: 0, total: 0, duration: '-' }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('수집 실패')).toBeInTheDocument();
    expect(screen.getByText('실패')).toBeInTheDocument();
  });

  it('unit이 통과면 통과 배지와 5/5', () => {
    render(
      <ProjectTile
        name="biz-mall"
        registered={['unit']}
        e2eLatest={null}
        e2eTrend={[]}
        unitLatest={baseUnit}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('통과')).toBeInTheDocument();
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });
});

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
