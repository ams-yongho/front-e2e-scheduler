import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { TestResult } from '../types';
import { FailureList } from './FailureList';
import { HistoryTable } from './HistoryTable';

interface Props {
  projectName: string;
  latest: TestResult | null;
  history: TestResult[];
}

export function ProjectCard({ projectName, latest, history }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">{projectName}</CardTitle>
        {latest ? (
          <Badge variant={latest.status === 'passed' ? 'default' : 'destructive'}>
            {latest.status === 'passed' ? '통과' : '실패'}
          </Badge>
        ) : (
          <Badge variant="secondary">데이터 없음</Badge>
        )}
      </CardHeader>
      <CardContent>
        {latest ? (
          <>
            <p className="text-sm text-muted-foreground">
              {latest.passed}/{latest.total} 통과
              {latest.failed > 0 && (
                <span className="ml-2 text-red-500">{latest.failed}건 실패</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{latest.duration}</p>
            {latest.failures.length > 0 && (
              <FailureList failures={latest.failures} />
            )}
          </>
        ) : null}

        {history.length > 0 && (
          <Collapsible className="mt-4">
            <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              히스토리 보기 ({history.length}건)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <HistoryTable results={history} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
