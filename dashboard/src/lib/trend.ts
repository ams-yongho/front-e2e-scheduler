import type { TestResult } from '../types';

/**
 * 통과율(%) 배열을 시간 오름차순(오래된 → 최신)으로 반환.
 * 결과가 없는 날은 건너뛰고, 결과가 있는 날만 점으로 표시한다.
 */
export function computeTrend(results: TestResult[]): number[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => (r.total > 0 ? Math.round((r.passed / r.total) * 100) : 100));
}
