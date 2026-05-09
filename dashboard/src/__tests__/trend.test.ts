import { describe, it, expect } from 'vitest';
import { computeTrend } from '../lib/trend';
import type { TestResult } from '../types';

const mk = (date: string, passed: number, total: number): TestResult => ({
  project: 'p', date, status: passed === total ? 'passed' : 'failed',
  total, passed, failed: total - passed, flaky: 0, skipped: 0, duration: '0초',
  browsers: [], failures: [], flakyTests: [], slowTests: [],
});

describe('computeTrend', () => {
  it('returns pass-rate percentages in chronological order (oldest first)', () => {
    const r = computeTrend([
      mk('2026-05-09', 9, 10),  // newest first in input
      mk('2026-05-08', 10, 10),
      mk('2026-05-07', 8, 10),
    ]);
    expect(r).toEqual([80, 100, 90]);
  });

  it('returns empty array when no results', () => {
    expect(computeTrend([])).toEqual([]);
  });

  it('handles total=0 as 100', () => {
    expect(computeTrend([mk('2026-05-09', 0, 0)])).toEqual([100]);
  });
});
