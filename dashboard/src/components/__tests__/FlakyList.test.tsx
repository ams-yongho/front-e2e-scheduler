import { render, screen } from '@testing-library/react';
import { FlakyList } from '../FlakyList';
import type { FlakyTest } from '../../types';

const tests: FlakyTest[] = [
  { test: '로그인 후 토큰 갱신', file: 'auth.spec.ts', line: 28, retries: 1 },
  { test: '실시간 알림 수신', file: 'notifications.spec.ts', line: 67, retries: 2 },
];

it('renders test names and retry counts', () => {
  render(<FlakyList tests={tests} />);
  expect(screen.getByText('로그인 후 토큰 갱신')).toBeInTheDocument();
  expect(screen.getByText('실시간 알림 수신')).toBeInTheDocument();
  expect(screen.getByText(/retry 1회 후 통과/)).toBeInTheDocument();
  expect(screen.getByText(/retry 2회 후 통과/)).toBeInTheDocument();
});

it('shows file location', () => {
  render(<FlakyList tests={tests} />);
  expect(screen.getByText('auth.spec.ts:28')).toBeInTheDocument();
});

it('renders nothing when empty', () => {
  const { container } = render(<FlakyList tests={[]} />);
  expect(container.firstChild).toBeNull();
});
