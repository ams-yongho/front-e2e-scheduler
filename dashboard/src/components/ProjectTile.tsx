import type { CSSProperties } from 'react';
import type { TestResult, UnitTestResult } from '../types';
import { Sparkline } from './Sparkline';

type ProjectTileProps = {
  name: string;
  registered: ('e2e' | 'unit')[];
  e2eLatest: TestResult | null;
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  onSelect(): void;
};

function overallBadge(
  registered: ('e2e' | 'unit')[],
  e2eLatest: TestResult | null,
  unitLatest: UnitTestResult | null,
): 'passed' | 'failed' | 'no-data' {
  const anyData = e2eLatest || unitLatest;
  if (!anyData) return 'no-data';
  const e2eFail = registered.includes('e2e') && (!e2eLatest || e2eLatest.status !== 'passed');
  const unitFail = registered.includes('unit') && (!unitLatest || unitLatest.status !== 'passed');
  return e2eFail || unitFail ? 'failed' : 'passed';
}

function TileStats({
  passed,
  total,
  failed,
  duration,
  status,
}: {
  passed: number;
  total: number;
  failed: number;
  duration: string;
  status: 'passed' | 'failed';
}) {
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
      <span style={{ color: status === 'failed' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
        {passed}/{total}
      </span>
      <span style={{ color: 'var(--text-muted)' }}> · 실패 {failed}</span>
      <span style={{ color: 'var(--text-muted)' }}> · {duration}</span>
      <span style={{ marginLeft: 6, opacity: 0.6, color: 'var(--text-muted)' }}>({passRate}%)</span>
    </span>
  );
}

export function ProjectTile({ name, registered, e2eLatest, e2eTrend, unitLatest, onSelect }: ProjectTileProps) {
  const statusKey = overallBadge(registered, e2eLatest, unitLatest);
  const accent =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--surface-4)';
  const badgeText = statusKey === 'failed' ? '실패' : statusKey === 'passed' ? '통과' : '데이터 없음';
  const badgeBg =
    statusKey === 'failed' ? 'var(--danger-muted)' : statusKey === 'passed' ? 'var(--success-muted)' : 'var(--surface-3)';
  const badgeFg =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--text-muted)';

  const latestDate = e2eLatest?.date ?? unitLatest?.date ?? null;

  return (
    <button
      type="button"
      aria-label={`${name} 프로젝트 상세 보기`}
      onClick={onSelect}
      style={{
        ...tileStyle,
        borderLeft: `2px solid ${accent}`,
        background:
          statusKey === 'failed'
            ? 'linear-gradient(180deg, rgba(229,72,77,0.08), var(--surface-1) 72%)'
            : 'var(--surface-1)',
      }}
    >
      {/* Row 1: name + badge */}
      <div style={headerRowStyle}>
        <div style={nameStyle}>{name}</div>
        <span style={{ ...badgeStyle, background: badgeBg, color: badgeFg }}>{badgeText}</span>
      </div>

      {/* Row 2: E2E + sparkline */}
      <div style={tileRowStyle}>
        <div style={rowBodyStyle}>
          <span style={rowLabelStyle}>E2E</span>
          {registered.includes('e2e')
            ? e2eLatest
              ? e2eLatest.status === 'error'
                ? <span style={{ ...emptyRowStyle, color: 'var(--danger)' }}>수집 실패</span>
                : (
                  <TileStats
                    passed={e2eLatest.passed}
                    total={e2eLatest.total}
                    failed={e2eLatest.failed}
                    duration={e2eLatest.duration}
                    status={e2eLatest.status}
                  />
                )
              : <span style={emptyRowStyle}>결과 없음</span>
            : <span style={emptyRowStyle}>등록 안 됨</span>}
        </div>
        {e2eTrend.length > 0 && (
          <div style={sparklineWrapStyle}>
            <Sparkline data={e2eTrend} accent={accent} />
            <span style={sparklineLabelStyle}>최근 {e2eTrend.length}일</span>
          </div>
        )}
      </div>

      {/* Row 3: Unit */}
      <div style={tileRowStyle}>
        <div style={rowBodyStyle}>
          <span style={rowLabelStyle}>Unit</span>
          {registered.includes('unit')
            ? unitLatest
              ? unitLatest.status === 'error'
                ? <span style={{ ...emptyRowStyle, color: 'var(--danger)' }}>수집 실패</span>
                : (
                  <TileStats
                    passed={unitLatest.passed}
                    total={unitLatest.total}
                    failed={unitLatest.failed}
                    duration={unitLatest.duration}
                    status={unitLatest.status}
                  />
                )
              : <span style={emptyRowStyle}>결과 없음</span>
            : <span style={emptyRowStyle}>등록 안 됨</span>}
        </div>
      </div>

      {/* Row 4: meta footer */}
      {latestDate && (
        <div style={metaFooterStyle}>
          <span style={{ color: 'var(--text-faint)', fontSize: 10.5 }}>실행일 </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 10.5 }}>{latestDate}</span>
          {e2eLatest && e2eLatest.flaky > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--warning)', fontSize: 10.5 }}>flaky {e2eLatest.flaky}</span>
          )}
        </div>
      )}
    </button>
  );
}

const tileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  padding: 14,
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  transition: 'border-color 0.15s ease, transform 0.15s ease, background 0.15s ease',
};

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const nameStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 650,
  fontSize: 14,
  letterSpacing: '-0.01em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: '1 1 0',
  minWidth: 0,
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  flexShrink: 0,
  letterSpacing: '0.02em',
};

const tileRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 22,
};

const rowBodyStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
};

const rowLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-faint)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  flexShrink: 0,
  minWidth: 28,
};

const emptyRowStyle: CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: 11.5,
};

const sparklineWrapStyle: CSSProperties = {
  width: 100,
  minHeight: 40,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: 3,
  flexShrink: 0,
};

const sparklineLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  color: 'var(--text-faint)',
};

const metaFooterStyle: CSSProperties = {
  borderTop: '1px solid var(--border-subtle)',
  paddingTop: 6,
  marginTop: 2,
};
