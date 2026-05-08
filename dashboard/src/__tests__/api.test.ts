import { describe, it, expect } from 'vitest';
import { last30Days } from '../api';

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
