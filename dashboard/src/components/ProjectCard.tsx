import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { TestResult } from '../types';
import { FailureList } from './FailureList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
}

function StatusBadge({ status }: { status: 'passed' | 'failed' | null }) {
  if (!status) {
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}
      >
        데이터 없음
      </span>
    );
  }
  if (status === 'passed') {
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ background: 'var(--success-muted)', color: 'var(--success)' }}
      >
        통과
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}
    >
      실패
    </span>
  );
}

export function ProjectCard({ projectName, latest, history }: Props) {
  const passRate =
    latest && latest.total > 0
      ? Math.round((latest.passed / latest.total) * 100)
      : null;

  const statusColor = !latest
    ? 'var(--surface-4)'
    : latest.status === 'passed'
      ? 'var(--success)'
      : 'var(--danger)';

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${statusColor}`,
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {projectName}
        </span>
        <StatusBadge status={latest?.status ?? null} />
      </div>

      {/* Progress bar */}
      {passRate !== null && (
        <div className="px-5 pb-3">
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--surface-3)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${passRate}%`,
                background: latest?.failed ? 'var(--danger)' : 'var(--success)',
              }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      {latest && (
        <div className="flex items-center gap-4 px-5 pb-4">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <span
              style={{
                color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {latest.passed}
            </span>
            <span className="mx-0.5">/</span>
            {latest.total} 통과
          </span>
          {latest.failed > 0 && (
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              {latest.failed}건 실패
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {latest.duration}
          </span>
        </div>
      )}

      {/* Failure list */}
      {latest?.failures && latest.failures.length > 0 && (
        <div
          className="mx-5 mb-4 overflow-hidden rounded-md"
          style={{ border: '1px solid rgba(229,72,77,0.15)' }}
        >
          <FailureList failures={latest.failures} />
        </div>
      )}

      {/* History collapsible */}
      {history.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger
            className="flex w-full items-center justify-between px-5 py-2.5 text-xs transition-colors"
            style={{
              borderTop: '1px solid var(--border-subtle)',
              color: 'var(--text-faint)',
            }}
          >
            <span>히스토리 보기 ({history.length}건)</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-4 pt-2">
              <HistoryTable results={history} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
