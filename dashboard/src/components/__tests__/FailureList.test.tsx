import { render, screen } from '@testing-library/react';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  {
    test: '결제 완료 플로우',
    file: 'checkout.spec.ts',
    line: 84,
    error: 'Expected visible',
    browser: 'webkit',
    steps: ['login', 'navigate /cart', 'click submit'],
    failedStepIdx: 2,
    attachments: [
      { name: 'screenshot', contentType: 'image/png' },
      { name: 'trace', contentType: 'application/zip' },
    ],
  },
];

it('renders failure title, file:line, error, and browser tag', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('checkout.spec.ts:84')).toBeInTheDocument();
  expect(screen.getByText('Expected visible')).toBeInTheDocument();
  expect(screen.getByText('webkit')).toBeInTheDocument();
});

it('renders step trail with failed step marker', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate /cart')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
});

it('renders attachment chips for each attachment', () => {
  render(<FailureList failures={failures} />);
  expect(screen.getByText(/screenshot/)).toBeInTheDocument();
  expect(screen.getByText(/trace/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
