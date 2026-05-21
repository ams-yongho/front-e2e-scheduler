import type { Manifest, TestResult, UnitTestResult } from './types';

const BASE = '/results';

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const raw = await res.json();
  return {
    projects: raw.projects ?? [],
    tests: raw.tests ?? Object.fromEntries((raw.projects ?? []).map((p: string) => [p, ['e2e']])),
    lastUpdated: raw.lastUpdated ?? '',
  };
}

async function fetchJsonOrNull<T>(url: string, defaults: Partial<T>): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text) as Partial<T>;
    return { ...defaults, ...parsed } as T;
  } catch {
    return null;
  }
}

export async function fetchE2eResult(project: string, date: string): Promise<TestResult | null> {
  return fetchJsonOrNull<TestResult>(`${BASE}/${project}/e2e/${date}.json`, {
    flaky: 0,
    browsers: [],
    failures: [],
    flakyTests: [],
    slowTests: [],
  });
}

export async function fetchUnitResult(project: string, date: string): Promise<UnitTestResult | null> {
  return fetchJsonOrNull<UnitTestResult>(`${BASE}/${project}/unit/${date}.json`, {
    failures: [],
    slowTests: [],
  });
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
