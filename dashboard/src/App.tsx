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
      } catch (e) {
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
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-semibold">E2E 테스트 대시보드</h1>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              마지막 실행: {new Date(lastUpdated).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
        {projects.length === 0 && !error ? (
          <p className="text-center text-muted-foreground">
            등록된 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="grid gap-4">
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
