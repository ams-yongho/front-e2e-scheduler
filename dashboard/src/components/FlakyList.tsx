import type { FlakyTest } from '../types';

interface Props {
  tests: FlakyTest[];
}

export function FlakyList({ tests }: Props) {
  if (tests.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {tests.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 12px',
            borderRadius: 6,
            background: 'rgba(245, 166, 35, 0.05)',
            border: '1px solid rgba(245, 166, 35, 0.13)',
          }}
        >
          <span style={{ color: 'var(--warning)', fontSize: 13, width: 14, textAlign: 'center' }}>⚡</span>
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>
            {t.test}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-faint)',
            }}
          >
            {t.file}:{t.line}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--warning)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              background: 'var(--warning-muted)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            retry {t.retries}회 후 통과
          </div>
        </div>
      ))}
    </div>
  );
}
