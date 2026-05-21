import { useEffect, useState } from 'react';
import { fetchManifest, fetchE2eResult, fetchUnitResult, last30Days } from './api';
import { ProjectGrid } from './components/ProjectGrid';
import { ProjectCard } from './components/ProjectCard';
import { computeTrend } from './lib/trend';
import type { TestResult, UnitTestResult } from './types';

export type RegisteredTypes = ('e2e' | 'unit')[];

export type ProjectData = {
  name: string;
  registered: RegisteredTypes;
  e2eLatest: TestResult | null;
  e2eHistory: TestResult[];
  e2eTrend: number[];
  unitLatest: UnitTestResult | null;
  unitHistory: UnitTestResult[];
};

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState(() => getSelectedProjectFromUrl());
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const manifest = await fetchManifest();
        setLastUpdated(manifest.lastUpdated);

        const days = last30Days();
        const projectData = await Promise.all(
          manifest.projects.map(async name => {
            const registered = manifest.tests[name] ?? ['e2e'];
            const wantsE2e = registered.includes('e2e');
            const wantsUnit = registered.includes('unit');

            const [e2eResults, unitResults] = await Promise.all([
              wantsE2e
                ? Promise.all(days.map(date => fetchE2eResult(name, date))).then(arr => arr.filter((r): r is TestResult => r !== null))
                : Promise.resolve([] as TestResult[]),
              wantsUnit
                ? Promise.all(days.map(date => fetchUnitResult(name, date))).then(arr => arr.filter((r): r is UnitTestResult => r !== null))
                : Promise.resolve([] as UnitTestResult[]),
            ]);

            return {
              name,
              registered,
              e2eLatest: e2eResults[0] ?? null,
              e2eHistory: e2eResults,
              e2eTrend: computeTrend(e2eResults),
              unitLatest: unitResults[0] ?? null,
              unitHistory: unitResults,
            };
          })
        );
        setProjects(projectData);
      } catch {
        setError('결과를 불러오지 못했습니다. Docker 컨테이너가 실행 중인지 확인하세요.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    function handlePopState() {
      setSelectedProjectName(getSelectedProjectFromUrl());
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  const passedCount = projects.filter(p => isProjectPassing(p)).length;
  const failedCount = projects.filter(p => isProjectFailing(p)).length;
  const flakyTotal = projects.reduce((sum, p) => sum + (p.e2eLatest?.flaky || 0), 0);
  const totalTests =
    projects.reduce((sum, p) => sum + (p.e2eLatest?.total || 0), 0) +
    projects.reduce((sum, p) => sum + (p.unitLatest?.total || 0), 0);
  const passedTests =
    projects.reduce((sum, p) => sum + (p.e2eLatest?.passed || 0), 0) +
    projects.reduce((sum, p) => sum + (p.unitLatest?.passed || 0), 0);
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  const selectedProject = selectedProjectName
    ? projects.find(project => project.name === selectedProjectName)
    : null;

  function selectProject(projectName: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('project', projectName);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, '', nextUrl);
    setSelectedProjectName(projectName);
  }

  function showProjectGrid() {
    const nextUrl = window.location.pathname;
    window.history.pushState(null, '', nextUrl);
    setSelectedProjectName(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#010102' }}>
      <Header lastUpdated={lastUpdated} />

      {projects.length > 0 && (
        <SummaryBar
          projectCount={projects.length}
          passedCount={passedCount}
          failedCount={failedCount}
          flakyTotal={flakyTotal}
          passRate={passRate}
          totalTests={totalTests}
          passedTests={passedTests}
        />
      )}

      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '22px 24px 60px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {error && (
          <div
            style={{
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              border: '1px solid rgba(229,72,77,0.2)',
            }}
          >
            {error}
          </div>
        )}
        {projects.length === 0 && !error ? (
          <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            등록된 프로젝트가 없습니다.
          </p>
        ) : selectedProject ? (
          <>
            <DetailNav projectName={selectedProject.name} onBack={showProjectGrid} />
            <ProjectCard
              projectName={selectedProject.name}
              registered={selectedProject.registered}
              e2eLatest={selectedProject.e2eLatest}
              e2eHistory={selectedProject.e2eHistory}
              e2eTrend={selectedProject.e2eTrend}
              unitLatest={selectedProject.unitLatest}
              unitHistory={selectedProject.unitHistory}
            />
          </>
        ) : (
          <ProjectGrid projects={projects} onSelect={selectProject} />
        )}
      </main>
    </div>
  );
}

function isProjectPassing(p: ProjectData) {
  if (p.registered.length === 0) return false;
  if (p.registered.includes('e2e') && (!p.e2eLatest || p.e2eLatest.failed > 0)) return false;
  if (p.registered.includes('unit') && p.unitLatest && p.unitLatest.failed > 0) return false;
  return Boolean(p.e2eLatest || p.unitLatest);
}

function isProjectFailing(p: ProjectData) {
  if (p.registered.includes('e2e') && p.e2eLatest && p.e2eLatest.failed > 0) return true;
  if (p.registered.includes('unit') && p.unitLatest && p.unitLatest.failed > 0) return true;
  return false;
}

function getSelectedProjectFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('project');
}

function DetailNav({ projectName, onBack }: { projectName: string; onBack: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '2px 0 8px',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          background: 'var(--surface-1)',
          color: 'var(--accent-hover)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          padding: '7px 10px',
        }}
      >
        프로젝트 목록
      </button>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {projectName}
      </div>
    </div>
  );
}

function Header({ lastUpdated }: { lastUpdated: string }) {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background:
          'linear-gradient(180deg, rgba(94,106,210,0.05) 0%, transparent 100%), var(--surface-1)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'saturate(150%) blur(8px)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '13px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, letterSpacing: '-0.012em', whiteSpace: 'nowrap' }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'white',
              boxShadow: '0 0 0 1px rgba(94,106,210,0.25), 0 4px 14px rgba(94,106,210,0.25)',
            }}
          >
            E
          </div>
          <span>E2E 테스트 대시보드</span>
        </div>
        {lastUpdated && (
          <div className="dashboard-header-meta" style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            마지막 실행 ·{' '}
            {new Date(lastUpdated).toLocaleString('ko-KR', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </header>
  );
}

function SummaryBar({
  projectCount,
  passedCount,
  failedCount,
  flakyTotal,
  passRate,
  totalTests,
  passedTests,
}: {
  projectCount: number;
  passedCount: number;
  failedCount: number;
  flakyTotal: number;
  passRate: number;
  totalTests: number;
  passedTests: number;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '11px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          fontSize: 12,
          color: 'var(--text-muted)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none',
        }}
      >
        <Stat>
          <span style={statValueStyle}>{projectCount}</span>개 프로젝트
        </Stat>
        <Divider />
        <Stat>
          <Dot color="var(--success)" />
          <span style={statValueStyle}>{passedCount}</span>통과
        </Stat>
        <Stat>
          <Dot color="var(--danger)" />
          <span style={statValueStyle}>{failedCount}</span>실패
        </Stat>
        {flakyTotal > 0 && (
          <Stat>
            <Dot color="var(--warning)" />
            <span style={statValueStyle}>{flakyTotal}</span>flaky
          </Stat>
        )}
        <Divider />
        <Stat>
          전체 통과율
          <span style={statValueStyle}>{passRate}%</span>
          <span style={statValueStyle}>{passedTests}/{totalTests}</span>
        </Stat>
      </div>
    </div>
  );
}

const statValueStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
  marginRight: 1,
  marginLeft: 4,
};

function Stat({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>{children}</div>;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

function Divider() {
  return <span style={{ width: 1, height: 12, background: 'var(--border-subtle)', flex: '0 0 auto' }} />;
}
