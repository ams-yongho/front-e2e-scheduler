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
  return res.json();
}

export function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}
