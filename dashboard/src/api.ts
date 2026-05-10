import type { Manifest, TestResult } from './types';

const BASE = '/results';

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchResult(
  project: string,
  date: string
): Promise<TestResult | null> {
  const res = await fetch(`${BASE}/${project}/${date}.json`);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text) as Partial<TestResult>;
    return {
      flaky: 0,
      browsers: [],
      failures: [],
      flakyTests: [],
      slowTests: [],
      ...parsed,
    } as TestResult;
  } catch {
    return null;
  }
}

function localDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return localDateString(d);
  });
}
