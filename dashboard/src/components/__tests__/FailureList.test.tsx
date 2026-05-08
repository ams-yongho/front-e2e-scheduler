import { render, screen } from '@testing-library/react';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  { test: '결제 완료 플로우', file: 'checkout.spec.ts', line: 84, error: 'Expected visible' },
  { test: '토큰 만료 처리', file: 'auth.spec.ts', line: 201, error: 'Timeout exceeded' },
];

it('renders all failure items', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('토큰 만료 처리')).toBeInTheDocument();
  expect(screen.getByText(/checkout\.spec\.ts/)).toBeInTheDocument();
  expect(screen.getByText(/84번째 줄/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
