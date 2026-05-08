import { useEffect, useState } from 'react';
import { fetchManifest, fetchResult, last30Days } from './api';
import { ProjectCard } from './components/ProjectCard';
import type { TestResult } from './types';

interface ProjectData {
  name: string;
  latest: TestResult | null;
  history: TestResult[];
}

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
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
            const results = (
              await Promise.all(days.map(date => fetchResult(name, date)))
            ).filter((r): r is TestResult => r !== null);

            return { name, latest: results[0] ?? null, history: results };
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  const passedCount = projects.filter(p => p.latest?.status === 'passed').length;
  const failedCount = projects.filter(p => p.latest?.status === 'failed').length;
  const noDataCount = projects.filter(p => !p.latest).length;

  return (
    <div className="min-h-screen" style={{ background: '#010102' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            E2E 테스트 대시보드
          </span>
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              마지막 실행:{' '}
              {new Date(lastUpdated).toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </header>

      {/* Summary bar */}
      {projects.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="mx-auto flex max-w-4xl items-center gap-5 px-6 py-2.5">
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {projects.length}개 프로젝트
            </span>
            {passedCount > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                ● {passedCount} 통과
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                ● {failedCount} 실패
              </span>
            )}
            {noDataCount > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                ● {noDataCount} 데이터 없음
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="mx-auto max-w-4xl px-6 py-5">
        {error && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              border: '1px solid rgba(229,72,77,0.2)',
            }}
          >
            {error}
          </div>
        )}
        {projects.length === 0 && !error ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            등록된 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map(p => (
              <ProjectCard
                key={p.name}
                projectName={p.name}
                latest={p.latest}
                history={p.history}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
