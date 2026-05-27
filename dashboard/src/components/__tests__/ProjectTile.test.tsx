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

  it('e2e는 통과했지만 등록된 unit 결과가 없으면 실패 배지', () => {
    const passingE2e: TestResult = {
      project: 'biz-mall',
      date: '2026-05-27',
      status: 'passed',
      total: 10,
      passed: 10,
      failed: 0,
      flaky: 0,
      skipped: 0,
      duration: '5초',
      browsers: [],
      failures: [],
      flakyTests: [],
      slowTests: [],
    };
    render(
      <ProjectTile
        name="biz-mall"
        registered={['e2e', 'unit']}
        e2eLatest={passingE2e}
        e2eTrend={[]}
        unitLatest={null}
        onSelect={vi.fn()}
      />,
    );
    // 등록된 unit 결과가 없으면 Slack 과 동일하게 실패로 표시되어야 한다
    expect(screen.getByText('실패')).toBeInTheDocument();
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
