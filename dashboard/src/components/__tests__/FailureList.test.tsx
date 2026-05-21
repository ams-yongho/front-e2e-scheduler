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
  expect(screen.getByText(/^📷 screenshot$/)).toBeInTheDocument();
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

it('removes ANSI control codes from the collapsed error summary', () => {
  const ansiFailure: TestFailure = {
    ...failures[0],
    error: '\u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).toBeVisible() failed',
  };

  render(<FailureList failures={[ansiFailure]} />);

  expect(screen.getByText('expect(locator).toBeVisible() failed')).toBeInTheDocument();
  expect(screen.queryByText(/\u001b/)).not.toBeInTheDocument();
});

it('renders nothing when failures is empty', () => {
  const { container } = render(<FailureList failures={[]} />);
  expect(container.firstChild).toBeNull();
});

it('renders real screenshot/video/error-context/trace when attachments have URLs', async () => {
  const user = userEvent.setup();
  const withUrls: TestFailure = {
    ...failures[0],
    attachments: [
      { name: 'screenshot', contentType: 'image/png', url: '/results/proj/e2e/attachments/2026-05-21/case/shot.png' },
      { name: 'video', contentType: 'video/webm', url: '/results/proj/e2e/attachments/2026-05-21/case/video.webm' },
      { name: 'error-context', contentType: 'text/markdown', url: '/results/proj/e2e/attachments/2026-05-21/case/error-context.md' },
      { name: 'trace', contentType: 'application/zip', url: '/results/proj/e2e/attachments/2026-05-21/case/trace.zip' },
    ],
  };

  render(<FailureList failures={[withUrls]} />);
  await user.click(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ }));

  const img = screen.getByRole('img', { name: /screenshot/i }) as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/results/proj/e2e/attachments/2026-05-21/case/shot.png');

  const video = document.querySelector('video') as HTMLVideoElement | null;
  expect(video).not.toBeNull();
  expect(video!.querySelector('source')?.getAttribute('src')).toBe(
    '/results/proj/e2e/attachments/2026-05-21/case/video.webm',
  );

  const ctxLink = screen.getByRole('link', { name: /error-context/i }) as HTMLAnchorElement;
  expect(ctxLink.getAttribute('href')).toBe('/results/proj/e2e/attachments/2026-05-21/case/error-context.md');

  const traceLink = screen.getByRole('link', { name: /trace/i }) as HTMLAnchorElement;
  expect(traceLink.getAttribute('href')).toBe('/results/proj/e2e/attachments/2026-05-21/case/trace.zip');
});

it('falls back to plain chip when attachment has no URL', async () => {
  const user = userEvent.setup();
  render(<FailureList failures={failures} />);
  await user.click(screen.getByRole('button', { name: /결제 완료 플로우 실패 상세 펼치기/ }));

  expect(screen.queryByRole('img', { name: /screenshot/i })).not.toBeInTheDocument();
  expect(document.querySelector('video')).toBeNull();
  expect(screen.queryByRole('link', { name: /trace/i })).not.toBeInTheDocument();
  expect(screen.getByText(/^📷 screenshot$/)).toBeInTheDocument();
  expect(screen.getByText(/^🔍 trace$/)).toBeInTheDocument();
});
