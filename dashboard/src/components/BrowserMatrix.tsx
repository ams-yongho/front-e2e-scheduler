import type { BrowserStat } from '../types';

type Props = {
  browsers: BrowserStat[];
};

export function BrowserMatrix({ browsers }: Props) {
  if (browsers.length === 0) return null;

  return (
    <div
      style={{
        padding: '14px 22px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 18,
        fontSize: 12,
      }}
    >
      <div
        style={{
          color: 'var(--text-faint)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          fontWeight: 500,
          marginRight: 4,
        }}
      >
        브라우저
      </div>
      {browsers.map(b => (
        <BrowserRow key={b.id} browser={b} />
      ))}
    </div>
  );
}

function BrowserRow({ browser }: { browser: BrowserStat }) {
  const failed = browser.failed > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: failed ? 'var(--danger-muted)' : 'var(--success-muted)',
          color: failed ? 'var(--danger)' : 'var(--success)',
          boxShadow: `inset 0 0 0 1px ${failed ? 'rgba(229,72,77,0.2)' : 'rgba(39,166,68,0.2)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {browser.icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {browser.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--text-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {browser.passed}/{browser.total}
          {browser.failed > 0 && (
            <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
              {' '}· {browser.failed} 실패
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
