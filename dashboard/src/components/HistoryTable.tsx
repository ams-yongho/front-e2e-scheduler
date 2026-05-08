import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        실행 기록 없음
      </p>
    );
  }

  return (
    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {['날짜', '상태', '성공 수', '실패 수', '소요시간'].map(h => (
            <th
              key={h}
              className="pb-2 text-left font-medium"
              style={{ color: 'var(--text-faint)' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map(r => (
          <tr
            key={r.date}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <td
              className="py-2 pr-4"
              style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
            >
              {r.date}
            </td>
            <td className="py-2 pr-4">
              <span
                className="font-medium"
                style={{ color: r.status === 'passed' ? 'var(--success)' : 'var(--danger)' }}
              >
                {r.status === 'passed' ? '통과' : '실패'}
              </span>
            </td>
            <td
              className="py-2 pr-4"
              style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}
            >
              {r.passed}
            </td>
            <td
              className="py-2 pr-4"
              style={{
                color: r.failed > 0 ? 'var(--danger)' : 'var(--text-faint)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.failed}
            </td>
            <td className="py-2" style={{ color: 'var(--text-faint)' }}>
              {r.duration}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
