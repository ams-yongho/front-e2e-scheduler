import { render, screen } from '@testing-library/react';
import { SlowTestsList } from '../SlowTestsList';
import type { SlowTest } from '../../types';

const tests: SlowTest[] = [
  { test: '대규모 데이터 임포트', file: 'import.spec.ts', durationMs: 28400 },
  { test: '리포트 PDF 생성', file: 'reports.spec.ts', durationMs: 22100 },
  { test: '결제 완료 플로우', file: 'checkout.spec.ts', durationMs: 18700 },
];

it('renders test name, file, and duration in seconds', () => {
  render(<SlowTestsList tests={tests} />);
  expect(screen.getByText('대규모 데이터 임포트')).toBeInTheDocument();
  expect(screen.getByText('· import.spec.ts')).toBeInTheDocument();
  expect(screen.getByText('28.4s')).toBeInTheDocument();
  expect(screen.getByText('22.1s')).toBeInTheDocument();
});

it('renders 1-based rank prefix', () => {
  render(<SlowTestsList tests={tests} />);
  expect(screen.getByText('01')).toBeInTheDocument();
  expect(screen.getByText('02')).toBeInTheDocument();
  expect(screen.getByText('03')).toBeInTheDocument();
});

it('renders nothing when empty', () => {
  const { container } = render(<SlowTestsList tests={[]} />);
  expect(container.firstChild).toBeNull();
});
