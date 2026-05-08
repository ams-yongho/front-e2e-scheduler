import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function HistoryTable({ results }: Props) {
  if (results.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">실행 기록 없음</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>날짜</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>성공 수</TableHead>
          <TableHead>실패 수</TableHead>
          <TableHead>소요시간</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map(r => (
          <TableRow key={r.date}>
            <TableCell>{r.date}</TableCell>
            <TableCell>
              <Badge variant={r.status === 'passed' ? 'default' : 'destructive'}>
                {r.status === 'passed' ? '통과' : '실패'}
              </Badge>
            </TableCell>
            <TableCell>{r.passed}</TableCell>
            <TableCell>{r.failed}</TableCell>
            <TableCell>{r.duration}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
