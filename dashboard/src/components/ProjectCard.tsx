import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { TestResult } from '../types';
import { Sparkline } from './Sparkline';
import { BrowserMatrix } from './BrowserMatrix';
import { FailureList } from './FailureList';
import { FlakyList } from './FlakyList';
import { SlowTestsList } from './SlowTestsList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
  trend: number[];
}

export function ProjectCard({ projectName, latest, history, trend }: Props) {
  const passRate = latest && latest.total > 0 ? (latest.passed / latest.total) * 100 : 0;
  const passRateInt = Math.round(passRate);
  const statusKey: 'failed' | 'passed' | 'no-data' = !latest
    ? 'no-data'
    : latest.failed > 0
      ? 'failed'
      : 'passed';
  const accent =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--surface-4)';

  return (
    <article
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${accent}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <CardHeader projectName={projectName} latest={latest} statusKey={statusKey} trend={trend} accent={accent} />

      {latest && <Stats latest={latest} passRate={passRate} passRateInt={passRateInt} />}

      {latest && <BrowserMatrix browsers={latest.browsers} />}

      {latest && latest.failures.length > 0 && (
        <Section title="실패 상세" count={`${latest.failures.length}건`} variant="danger">
          <FailureList failures={latest.failures} />
        </Section>
      )}

      {latest && latest.flakyTests.length > 0 && (
        <Section title="Flaky 테스트 — 재시도 후 통과" count={`${latest.flakyTests.length}건`} variant="warning">
          <FlakyList tests={latest.flakyTests} />
        </Section>
      )}

      {latest && latest.slowTests.length > 0 && (
        <Section title="가장 느린 테스트" count={`Top ${latest.slowTests.length}`} variant="default">
          <SlowTestsList tests={latest.slowTests} />
        </Section>
      )}

      {history.length > 0 && <HistoryToggle history={history} />}
    </article>
  );
}

function CardHeader({
  projectName,
  latest,
  statusKey,
  trend,
  accent,
}: {
  projectName: string;
  latest: TestResult | null;
  statusKey: 'failed' | 'passed' | 'no-data';
  trend: number[];
  accent: string;
}) {
  const badgeText = statusKey === 'failed' ? '실패' : statusKey === 'passed' ? '통과' : '데이터 없음';
  const badgeBg =
    statusKey === 'failed' ? 'var(--danger-muted)' : statusKey === 'passed' ? 'var(--success-muted)' : 'var(--surface-3)';
  const badgeFg =
    statusKey === 'failed' ? 'var(--danger)' : statusKey === 'passed' ? 'var(--success)' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px 4px' }}>
      <div
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.014em',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        {projectName}
        {latest && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 400,
            }}
          >
            · {latest.date}
          </span>
        )}
      </div>
      {trend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Sparkline data={trend} accent={accent} />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--text-faint)',
              letterSpacing: '0.02em',
            }}
          >
            최근 {trend.length}일 통과율
          </div>
        </div>
      )}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: '3px 10px',
          borderRadius: 999,
          letterSpacing: '0.02em',
          background: badgeBg,
          color: badgeFg,
        }}
      >
        {badgeText}
      </span>
    </div>
  );
}

function Stats({
  latest,
  passRate,
  passRateInt,
}: {
  latest: TestResult;
  passRate: number;
  passRateInt: number;
}) {
  const progressColor = latest.failed > 0 ? 'var(--danger)' : 'var(--success)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
        gap: 26,
        padding: '14px 22px 18px',
      }}
    >
      <div>
        <Label>통과율</Label>
        <Value>
          {passRateInt}
          <Sub>% · {latest.passed}/{latest.total}</Sub>
        </Value>
        <div
          style={{
            marginTop: 10,
            height: 4,
            background: 'var(--surface-3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${passRate}%`,
              background: progressColor,
              borderRadius: 2,
              transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          />
        </div>
      </div>
      <div>
        <Label>실행 시간</Label>
        <Value>{latest.duration}</Value>
      </div>
      <div>
        <Label>실패 수</Label>
        <Value tone={latest.failed > 0 ? 'danger' : 'muted'}>
          {latest.failed}
          <Sub>건</Sub>
        </Value>
      </div>
      <div>
        <Label>Flaky</Label>
        <Value tone={latest.flaky > 0 ? 'warning' : 'muted'}>
          {latest.flaky}
          <Sub>건</Sub>
        </Value>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: 'var(--text-faint)',
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        fontWeight: 500,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Value({ children, tone }: { children: React.ReactNode; tone?: 'danger' | 'warning' | 'muted' }) {
  const color =
    tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : tone === 'muted' ? 'var(--text-faint)' : 'var(--text-primary)';
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 22,
        fontWeight: 500,
        color,
        letterSpacing: '-0.025em',
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        lineHeight: 1.1,
      }}
    >
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0 }}>
      {children}
    </span>
  );
}

function Section({
  title,
  count,
  variant,
  children,
}: {
  title: string;
  count: string;
  variant: 'danger' | 'warning' | 'default';
  children: React.ReactNode;
}) {
  const countBg =
    variant === 'danger' ? 'var(--danger-muted)' : variant === 'warning' ? 'var(--warning-muted)' : 'var(--surface-3)';
  const countFg =
    variant === 'danger' ? 'var(--danger)' : variant === 'warning' ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div
        style={{
          padding: '14px 22px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-faint)',
          fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            background: countBg,
            color: countFg,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10.5,
            letterSpacing: 0,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function HistoryToggle({ history }: { history: TestResult[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '12px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--text-muted)',
          background: 'transparent',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span>30일 히스토리 — {history.length}건</span>
        <ChevronDown
          style={{
            width: 14,
            height: 14,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 22px 18px' }}>
          <HistoryTable results={history} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
