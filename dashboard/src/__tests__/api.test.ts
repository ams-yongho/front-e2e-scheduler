import { describe, it, expect, vi, beforeEach } from 'vitest';
import { last30Days, fetchManifest, fetchE2eResult, fetchUnitResult } from '../api';

describe('last30Days', () => {
  it('returns 30 items', () => {
    expect(last30Days()).toHaveLength(30);
  });

  it('first item is today in YYYY-MM-DD format', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(last30Days()[0]).toBe(today);
  });

  it('items are in descending order', () => {
    const days = last30Days();
    expect(days[0] > days[1]).toBe(true);
    expect(days[1] > days[2]).toBe(true);
  });
});

describe('manifest with tests map', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('parses tests map', async () => {
    const stub = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: ['ca-admin', 'biz-admin'],
        tests: { 'ca-admin': ['e2e', 'unit'], 'biz-admin': ['e2e'] },
        lastUpdated: '2026-05-21T03:00:00.000Z',
      }),
    } as Response);
    const m = await fetchManifest();
    expect(m.tests['ca-admin']).toEqual(['e2e', 'unit']);
    expect(m.tests['biz-admin']).toEqual(['e2e']);
    stub.mockRestore();
  });
});

describe('fetchE2eResult / fetchUnitResult', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetchE2eResult hits /results/<project>/e2e/<date>.json', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ project: 'ca-admin', type: 'e2e', date: '2026-05-21', status: 'passed', total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, duration: '1초' }),
    } as Response);
    const r = await fetchE2eResult('ca-admin', '2026-05-21');
    expect(fetchSpy).toHaveBeenCalledWith('/results/ca-admin/e2e/2026-05-21.json');
    expect(r?.type).toBe('e2e');
  });

  it('fetchUnitResult hits /results/<project>/unit/<date>.json', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ project: 'ca-admin', type: 'unit', framework: 'vitest', date: '2026-05-21', status: 'passed', total: 5, passed: 5, failed: 0, skipped: 0, duration: '2초' }),
    } as Response);
    const r = await fetchUnitResult('ca-admin', '2026-05-21');
    expect(fetchSpy).toHaveBeenCalledWith('/results/ca-admin/unit/2026-05-21.json');
    expect(r?.framework).toBe('vitest');
  });
});
