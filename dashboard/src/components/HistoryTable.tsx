import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return (
      <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
        실행 기록 없음
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {['날짜', '상태', '통과 수', '실패 수', '소요시간', '통과율'].map(h => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '8px 0',
                fontWeight: 500,
                color: 'var(--text-faint)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map(r => {
          const rate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
          const failColor = r.failed > 0 ? 'var(--danger)' : 'var(--text-faint)';
          return (
            <tr key={r.date} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={cellStyle({ color: 'var(--text-secondary)' })}>{r.date}</td>
              <td
                style={cellStyle({
                  color: r.status === 'passed' ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 500,
                })}
              >
                {r.status === 'passed' ? '통과' : '실패'}
              </td>
              <td style={cellStyle({ color: 'var(--text-secondary)' })}>{r.passed}</td>
              <td style={cellStyle({ color: failColor, fontWeight: r.failed > 0 ? 500 : 400 })}>{r.failed}</td>
              <td style={cellStyle({ color: 'var(--text-faint)' })}>{r.duration}</td>
              <td style={cellStyle({})}>
                <MiniBar rate={rate} failed={r.failed > 0} />
                <span style={{ color: failColor, fontSize: 10.5 }}>{rate}%</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function cellStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    padding: '8px 0',
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 11.5,
    ...extra,
  };
}

function MiniBar({ rate, failed }: { rate: number; failed: boolean }) {
  return (
    <span
      style={{
        width: 56,
        height: 4,
        background: 'var(--surface-3)',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: 8,
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${rate}%`,
          background: failed ? 'var(--danger)' : 'var(--success)',
        }}
      />
    </span>
  );
}
