import type { UnitTestResult } from '../types';

export function UnitDetail({ latest, history }: { latest: UnitTestResult | null; history: UnitTestResult[] }) {
  if (!latest) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        유닛테스트 결과가 없습니다.
      </div>
    );
  }
  const passRate = latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2)', fontFamily: 'var(--font-mono)' }}>
          {latest.framework}
        </span>
        <span data-status={latest.status} style={{ fontWeight: 600 }}>
          {latest.passed}/{latest.total} 통과
        </span>
        <span style={{ color: 'var(--text-muted)' }}>실패 {latest.failed}건</span>
        <span style={{ color: 'var(--text-muted)' }}>· {latest.duration}</span>
        <span style={{ color: 'var(--text-muted)' }}>· {passRate}%</span>
      </header>

      {latest.failures.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>실패 목록</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            {latest.failures.map((f, i) => (
              <li key={i} style={{ borderLeft: '3px solid var(--danger)', padding: '6px 10px', background: 'var(--danger-muted)', borderRadius: 4 }}>
                <div style={{ fontWeight: 600 }}>{f.test}</div>
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.file}{f.line ? `:${f.line}` : ''}</div>
                {f.error && <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{f.error}</pre>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.slowTests.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>느린 테스트</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {latest.slowTests.map((s, i) => (
              <li key={i}>{s.durationMs} ms · {s.test} <span style={{ color: 'var(--text-muted)' }}>({s.file})</span></li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 1 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '8px 0' }}>30일 히스토리</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {history.slice(0, 30).map(h => (
              <li key={h.date} data-status={h.status}>
                {h.date} · {h.passed}/{h.total} · {h.duration}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
