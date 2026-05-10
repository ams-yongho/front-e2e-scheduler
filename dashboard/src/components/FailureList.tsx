import type { TestFailure } from '../types';
import { StepTrail } from './StepTrail';

type Props = {
  failures: TestFailure[];
};

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {failures.map((f, i) => (
        <FailureItem key={i} failure={f} />
      ))}
    </div>
  );
}

function FailureItem({ failure: f }: { failure: TestFailure }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 8,
        background: 'rgba(229, 72, 77, 0.04)',
        border: '1px solid rgba(229, 72, 77, 0.13)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 13, width: 14, textAlign: 'center' }}>
          ✕
        </span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>
          {f.test}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>
          {f.file}:{f.line}
        </div>
        <div
          style={{
            background: 'var(--surface-3)',
            color: 'var(--text-secondary)',
            padding: '2px 8px',
            fontSize: 10,
            borderRadius: 999,
            fontWeight: 500,
            letterSpacing: '0.04em',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {f.browser}
        </div>
      </div>

      <StepTrail steps={f.steps} failedStepIdx={f.failedStepIdx} />

      <div
        style={{
          marginTop: 12,
          marginLeft: 24,
          display: 'grid',
          gridTemplateColumns: '132px 1fr',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <ScreenshotPlaceholder />
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            padding: '8px 10px',
            background: 'var(--surface-2)',
            borderRadius: 4,
            borderLeft: '2px solid var(--danger)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.55,
            letterSpacing: '-0.01em',
            overflow: 'auto',
            maxHeight: 100,
            margin: 0,
          }}
        >
          {f.error}
        </pre>
      </div>

      {f.attachments.length > 0 && (
        <div
          style={{
            marginTop: 10,
            marginLeft: 24,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {f.attachments.map((a, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--accent-hover)',
                padding: '4px 9px',
                borderRadius: 4,
                background: 'rgba(94,106,210,0.08)',
                border: '1px solid rgba(94,106,210,0.14)',
              }}
            >
              {iconFor(a.name)} {a.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScreenshotPlaceholder() {
  return (
    <div
      style={{
        borderRadius: 5,
        background: [
          'radial-gradient(at 30% 30%, rgba(94,106,210,0.15), transparent 60%)',
          'radial-gradient(at 70% 70%, rgba(229,72,77,0.12), transparent 60%)',
          'linear-gradient(135deg, #2a2b35 0%, #1a1b22 100%)',
        ].join(', '),
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: '16 / 10',
      }}
    >
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          right: 8,
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          background: 'rgba(0,0,0,0.55)',
          padding: '1px 6px',
          borderRadius: 3,
          letterSpacing: '0.02em',
        }}
      >
        📷 screenshot
      </span>
    </div>
  );
}

function iconFor(name: string): string {
  if (name.includes('screenshot') || name.includes('image')) return '📷';
  if (name.includes('video')) return '🎬';
  if (name.includes('trace')) return '🔍';
  return '📎';
}
