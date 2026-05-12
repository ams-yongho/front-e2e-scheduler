import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FailureList } from '../FailureList';
import type { TestFailure } from '../../types';

const failures: TestFailure[] = [
  {
    test: '결제 완료 플로우',
    file: 'checkout.spec.ts',
    line: 84,
    error: [
      'Error: Expected visible',
      '',
      'Locator: getByText("결제완료")',
      'Expected: visible',
      'Received: hidden',
    ].join('\n'),
    browser: 'webkit',
    steps: ['login', 'navigate /cart', 'click submit'],
    failedStepIdx: 2,
    attachments: [
      { name: 'screenshot', contentType: 'image/png' },
      { name: 'trace', contentType: 'application/zip' },
    ],
  },
];

it('renders a compact collapsed failure summary by default', () => {
  render(<FailureList failures={failures} />);

  expect(screen.getByText('결제 완료 플로우')).toBeInTheDocument();
  expect(screen.getByText('checkout.spec.ts:84')).toBeInTheDocument();
  expect(screen.getByText('webkit')).toBeInTheDocument();
  expect(screen.getByText('Error: Expected visible')).toBeInTheDocument();
  expect(screen.getByText('첨부 2개')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  expect(screen.queryByText('login')).not.toBeInTheDocument();
  expect(screen.queryByText('Locator: getByText("결제완료")')).not.toBeInTheDocument();
  expect(screen.queryByText(/^🔍 trace$/)).not.toBeInTheDocument();
});

it('expands and collapses a failure detail when the summary row is clicked', async () => {
  const user = userEvent.setup();
  render(<FailureList failures={failures} />);

  const trigger = screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ });

  await user.click(trigger);

  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate /cart')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
  expect(screen.getByText(/Locator: getByText/)).toBeInTheDocument();
  expect(screen.getAllByText(/^📷 screenshot$/)).toHaveLength(2);
  expect(screen.getByText(/^🔍 trace$/)).toBeInTheDocument();

  await user.click(trigger);

  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('login')).not.toBeInTheDocument();
  expect(screen.queryByText(/Locator: getByText/)).not.toBeInTheDocument();
});

it('truncates a very long error summary without changing the expanded error body', async () => {
  const user = userEvent.setup();
  const longFailure: TestFailure = {
    ...failures[0],
    error: `${'A'.repeat(180)}\nsecond line remains in expanded body`,
  };

  render(<FailureList failures={[longFailure]} />);

  expect(screen.getByText(`${'A'.repeat(137)}...`)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ }));

  expect(screen.getByText(/second line remains in expanded body/)).toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});
