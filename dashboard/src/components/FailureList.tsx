import type { TestFailure } from '../types';

interface Props {
  failures: TestFailure[];
}

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <ul>
      {failures.map((f, i) => (
        <li
          key={i}
          className="px-3 py-2.5"
          style={{
            background: 'var(--danger-muted)',
            borderBottom: i < failures.length - 1 ? '1px solid rgba(229,72,77,0.1)' : undefined,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              {f.test}
            </span>
            <span className="shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
              {f.file} · {f.line}번째 줄
            </span>
          </div>
          {f.error && (
            <p className="mt-1 truncate font-mono text-xs" style={{ color: 'var(--text-faint)' }}>
              {f.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
