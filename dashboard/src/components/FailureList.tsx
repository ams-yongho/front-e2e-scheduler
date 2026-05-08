import type { TestFailure } from '../types';

interface Props {
  failures: TestFailure[];
}

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {failures.map((f, i) => (
        <li key={i} className="rounded-md bg-red-50 px-3 py-2 text-sm">
          <span className="font-medium text-red-700">{f.test}</span>
          <span className="ml-2 text-red-500">
            {f.file} · {f.line}번째 줄
          </span>
          {f.error && (
            <p className="mt-1 truncate text-xs text-red-400">{f.error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
