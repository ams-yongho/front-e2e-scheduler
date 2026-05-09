import { render, screen } from '@testing-library/react';
import { BrowserMatrix } from '../BrowserMatrix';
import type { BrowserStat } from '../../types';

const browsers: BrowserStat[] = [
  { id: 'chromium', name: 'Chromium', icon: 'CR', passed: 28, failed: 1, flaky: 0, skipped: 0, total: 29 },
  { id: 'webkit',   name: 'WebKit',   icon: 'WK', passed: 27, failed: 2, flaky: 0, skipped: 0, total: 29 },
  { id: 'firefox',  name: 'Firefox',  icon: 'FF', passed: 29, failed: 0, flaky: 0, skipped: 0, total: 29 },
];

it('renders a row per browser with name and counts', () => {
  render(<BrowserMatrix browsers={browsers} />);
  expect(screen.getByText('Chromium')).toBeInTheDocument();
  expect(screen.getByText('WebKit')).toBeInTheDocument();
  expect(screen.getByText('Firefox')).toBeInTheDocument();
  expect(screen.getByText('28/29')).toBeInTheDocument();
  expect(screen.getByText('29/29')).toBeInTheDocument();
});

it('shows fail count when failures exist', () => {
  render(<BrowserMatrix browsers={browsers} />);
  expect(screen.getByText(/2 실패/)).toBeInTheDocument();
});

it('renders nothing when browsers is empty', () => {
  const { container } = render(<BrowserMatrix browsers={[]} />);
  expect(container.firstChild).toBeNull();
});
