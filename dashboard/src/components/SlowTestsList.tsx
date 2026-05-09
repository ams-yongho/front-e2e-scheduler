import type { SlowTest } from '../types';

interface Props {
  tests: SlowTest[];
}

export function SlowTestsList({ tests }: Props) {
  if (tests.length === 0) return null;
  const maxMs = Math.max(...tests.map(t => t.durationMs), 1);

  return (
    <div
      style={{
        padding: '4px 22px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {tests.map((t, i) => {
        const pct = (t.durationMs / maxMs) * 100;
        const sec = (t.durationMs / 1000).toFixed(1);
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '320px 1fr 60px',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'baseline',
                gap: 7,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--text-faint)',
                  marginRight: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {t.test}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--text-faint)',
                }}
              >
                · {t.file}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--surface-3)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct.toFixed(1)}%`,
                  background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)',
                  borderRadius: 3,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}
            >
              {sec}s
            </div>
          </div>
        );
      })}
    </div>
  );
}
