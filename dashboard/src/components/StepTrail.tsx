interface Props {
  steps: string[];
  failedStepIdx: number;
}

export function StepTrail({ steps, failedStepIdx }: Props) {
  if (steps.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        marginTop: 9,
        paddingLeft: 24,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      {steps.map((step, i) => {
        const failed = i === failedStepIdx;
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                background: failed ? 'var(--danger-muted)' : 'var(--surface-2)',
                color: failed ? 'var(--danger)' : 'var(--text-muted)',
                padding: '3px 9px',
                borderRadius: 4,
                letterSpacing: '-0.01em',
                fontWeight: failed ? 500 : 400,
                boxShadow: failed ? '0 0 0 1px rgba(229,72,77,0.2)' : undefined,
              }}
            >
              {failed ? '✕ ' : ''}{step}
            </span>
            {i < steps.length - 1 && (
              <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>→</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
