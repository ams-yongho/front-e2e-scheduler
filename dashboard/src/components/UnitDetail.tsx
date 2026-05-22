import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { UnitTestResult } from '../types';
import { Sparkline } from './Sparkline';
import { SlowTestsList } from './SlowTestsList';
import { UnitHistoryTable } from './UnitHistoryTable';

type Props = {
  latest: UnitTestResult | null;
  history: UnitTestResult[];
  unitTrend?: number[];
};

export function UnitDetail({ latest, history, unitTrend = [] }: Props) {
  if (!latest) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        유닛테스트 결과가 없습니다.
      </div>
    );
  }

  const passRate = latest.total > 0 ? (latest.passed / latest.total) * 100 : 0;
  const passRateInt = Math.round(passRate);
  const statusKey: 'failed' | 'passed' = latest.failed > 0 ? 'failed' : 'passed';
  const accent = statusKey === 'failed' ? 'var(--danger)' : 'var(--success)';

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
      <UnitCardHeader latest={latest} statusKey={statusKey} unitTrend={unitTrend} accent={accent} />
      <UnitStats latest={latest} passRate={passRate} passRateInt={passRateInt} />

      {latest.failures.length > 0 && (
        <Section title="실패 목록" count={`${latest.failures.length}건`} variant="danger">
          <FailureList failures={latest.failures} />
        </Section>
      )}

      {latest.slowTests.length > 0 && (
        <Section title="느린 테스트" count={`Top ${latest.slowTests.length}`} variant="default">
          <SlowTestsList tests={latest.slowTests} />
        </Section>
      )}

      {history.length > 0 && <UnitHistoryToggle history={history} />}
    </article>
  );
}

function UnitCardHeader({
  latest,
  statusKey,
  unitTrend,
  accent,
}: {
  latest: UnitTestResult;
  statusKey: 'failed' | 'passed';
  unitTrend: number[];
  accent: string;
}) {
  const badgeText = statusKey === 'failed' ? '실패' : '통과';
  const badgeBg = statusKey === 'failed' ? 'var(--danger-muted)' : 'var(--success-muted)';
  const badgeFg = statusKey === 'failed' ? 'var(--danger)' : 'var(--success)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px 4px' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {latest.framework}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
          · <span>{latest.date}</span>
        </span>
      </div>
      {unitTrend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <Sparkline data={unitTrend} accent={accent} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.02em' }}>
            최근 {unitTrend.length}일 통과율
          </div>
        </div>
      )}
      <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 999, letterSpacing: '0.02em', background: badgeBg, color: badgeFg }}>
        {badgeText}
      </span>
    </div>
  );
}

function UnitStats({ latest, passRate, passRateInt }: { latest: UnitTestResult; passRate: number; passRateInt: number }) {
  const progressColor = latest.failed > 0 ? 'var(--danger)' : 'var(--success)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr 1fr', gap: 26, padding: '14px 22px 18px' }}>
      <div>
        <Label>통과율</Label>
        <Value>{passRateInt}<Sub>% · {latest.passed}/{latest.total}</Sub></Value>
        <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${passRate}%`, background: progressColor, borderRadius: 2, transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
        </div>
      </div>
      <div>
        <Label>실행 시간</Label>
        <Value>{latest.duration}</Value>
      </div>
      <div>
        <Label>실패 수</Label>
        <Value tone={latest.failed > 0 ? 'danger' : 'muted'}>{latest.failed}<Sub>건</Sub></Value>
      </div>
      <div>
        <Label>스킵</Label>
        <Value tone={latest.skipped > 0 ? 'warning' : 'muted'}>{latest.skipped}<Sub>건</Sub></Value>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 500, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Value({ children, tone }: { children: React.ReactNode; tone?: 'danger' | 'warning' | 'muted' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : tone === 'muted' ? 'var(--text-faint)' : 'var(--text-primary)';
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 500, color, letterSpacing: '-0.025em', display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1.1 }}>
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0 }}>{children}</span>;
}

function Section({ title, count, variant, children }: { title: string; count: string; variant: 'danger' | 'warning' | 'default'; children: React.ReactNode }) {
  const countBg = variant === 'danger' ? 'var(--danger-muted)' : variant === 'warning' ? 'var(--warning-muted)' : 'var(--surface-3)';
  const countFg = variant === 'danger' ? 'var(--danger)' : variant === 'warning' ? 'var(--warning)' : 'var(--text-muted)';
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ padding: '14px 22px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 500 }}>
        <span>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', background: countBg, color: countFg, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function FailureList({ failures }: { failures: UnitTestResult['failures'] }) {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, padding: '0 22px 16px', listStyle: 'none' }}>
      {failures.map((f, i) => (
        <li key={i} style={{ borderLeft: '3px solid var(--danger)', padding: '6px 10px', background: 'var(--danger-muted)', borderRadius: 4 }}>
          <div style={{ fontWeight: 600 }}>{f.test}</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{f.file}{f.line ? `:${f.line}` : ''}</div>
          {f.error && <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{f.error}</pre>}
        </li>
      ))}
    </ul>
  );
}

function UnitHistoryToggle({ history }: { history: UnitTestResult[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        style={{ borderTop: '1px solid var(--border-subtle)', padding: '12px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }}
      >
        <span>30일 히스토리 — {history.length}건</span>
        <ChevronDown style={{ width: 14, height: 14, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 22px 18px' }}>
          <UnitHistoryTable results={history} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
