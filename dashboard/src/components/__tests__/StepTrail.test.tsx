import { render, screen } from '@testing-library/react';
import { StepTrail } from '../StepTrail';

it('renders all steps with arrows between them', () => {
  render(<StepTrail steps={['login', 'navigate', 'click submit']} failedStepIdx={2} />);
  expect(screen.getByText('login')).toBeInTheDocument();
  expect(screen.getByText('navigate')).toBeInTheDocument();
  expect(screen.getByText('✕ click submit')).toBeInTheDocument();
  // 2 arrows for 3 steps
  expect(screen.getAllByText('→')).toHaveLength(2);
});

it('handles no failed step (failedStepIdx = -1)', () => {
  render(<StepTrail steps={['a', 'b']} failedStepIdx={-1} />);
  expect(screen.getByText('a')).toBeInTheDocument();
  expect(screen.queryByText(/✕/)).not.toBeInTheDocument();
});

it('renders nothing when steps is empty', () => {
  const { container } = render(<StepTrail steps={[]} failedStepIdx={-1} />);
  expect(container.firstChild).toBeNull();
});
