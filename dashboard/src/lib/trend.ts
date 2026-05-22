import type { TestResult, UnitTestResult } from '../types';

interface HasPassRate {
  date: string;
  total: number;
  passed: number;
}

function passRateTrend(results: HasPassRate[]): number[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => (r.total > 0 ? Math.round((r.passed / r.total) * 100) : 100));
}

export function computeTrend(results: TestResult[]): number[] {
  return passRateTrend(results);
}

export function computeUnitTrend(results: UnitTestResult[]): number[] {
  return passRateTrend(results);
}
