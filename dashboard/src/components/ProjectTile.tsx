import type { CSSProperties } from 'react';
import type { ProjectData } from '../App';
import { Sparkline } from './Sparkline';

type Props = {
  project: ProjectData;
  onSelect: (projectName: string) => void;
};

export function ProjectTile({ project, onSelect }: Props) {
  const latest = project.e2eLatest;
  const statusKey: 'failed' | 'passed' | 'no-data' = !latest
    ? 'no-data'
    : latest.failed > 0
      ? 'failed'
      : 'passed';
  const passRate = latest && latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0;
  const accent =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--surface-4)';
  const badgeText = statusKey === 'failed' ? '실패' : statusKey === 'passed' ? '통과' : '데이터 없음';
  const badgeBg =
    statusKey === 'failed' ? 'var(--danger-muted)' : statusKey === 'passed' ? 'var(--success-muted)' : 'var(--surface-3)';
  const badgeFg =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--text-muted)';

  return (
    <button
      type="button"
      aria-label={`${project.name} 프로젝트 상세 보기`}
      onClick={() => onSelect(project.name)}
      style={{
        ...tileStyle,
        borderLeft: `2px solid ${accent}`,
        background:
          statusKey === 'failed'
            ? 'linear-gradient(180deg, rgba(229,72,77,0.08), var(--surface-1) 72%)'
            : 'var(--surface-1)',
      }}
    >
      <div style={nameStyle}>{project.name}</div>
      <span style={{ ...badgeStyle, background: badgeBg, color: badgeFg }}>{badgeText}</span>

      {latest ? (
        <>
          <div style={rateStyle}>
            {passRate}
            <span style={rateSubStyle}>% · {latest.passed}/{latest.total}</span>
          </div>
          <div className="project-tile__sparkline" style={sparklineWrapStyle}>
            <Sparkline data={project.e2eTrend} accent={accent} />
            <span style={sparklineLabelStyle}>최근 {project.e2eTrend.length}일</span>
          </div>
          <div className="project-tile__meta" style={metaGridStyle}>
            <Meta label="시간" value={latest.duration} />
            <Meta label="실패" value={latest.failed} tone={latest.failed > 0 ? 'danger' : undefined} />
            <Meta label="flaky" value={latest.flaky} tone={latest.flaky > 0 ? 'warning' : undefined} />
            <Meta label="실행일" value={latest.date} />
          </div>
        </>
      ) : (
        <div style={emptyStyle}>결과 없음</div>
      )}
    </button>
  );
}

function Meta({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'danger' | 'warning';
}) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--text-secondary)';

  return (
    <div style={metaStyle}>
      <strong style={{ ...metaValueStyle, color }}>{value}</strong>
      {label}
    </div>
  );
}

const tileStyle: CSSProperties = {
  minHeight: 126,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gridTemplateRows: 'auto 1fr auto',
  gap: '10px 14px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  padding: 14,
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  transition: 'border-color 0.15s ease, transform 0.15s ease, background 0.15s ease',
};

const nameStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 650,
  fontSize: 14,
  letterSpacing: '-0.01em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  alignSelf: 'start',
  letterSpacing: '0.02em',
};

const rateStyle: CSSProperties = {
  gridColumn: '1 / 2',
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 28,
  fontWeight: 500,
  lineHeight: 1,
  letterSpacing: '-0.02em',
};

const rateSubStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 400,
  letterSpacing: 0,
};

const sparklineWrapStyle: CSSProperties = {
  gridColumn: '2 / 3',
  gridRow: '2 / 4',
  width: 118,
  minHeight: 62,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: 3,
};

const sparklineLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  color: 'var(--text-faint)',
};

const metaGridStyle: CSSProperties = {
  gridColumn: '1 / 2',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 6,
};

const metaStyle: CSSProperties = {
  minWidth: 0,
  color: 'var(--text-muted)',
  fontSize: 10.5,
};

const metaValueStyle: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
};

const emptyStyle: CSSProperties = {
  gridColumn: '1 / 3',
  alignSelf: 'center',
  color: 'var(--text-faint)',
  fontSize: 13,
};
