import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ProjectGrid } from '../ProjectGrid';
import type { ProjectData } from '../../App';

const project: ProjectData = {
  name: 'biz-admin',
  registered: ['e2e'],
  e2eLatest: null,
  e2eHistory: [],
  e2eTrend: [],
  unitLatest: null,
  unitHistory: [],
};

it('renders project tiles', () => {
  render(<ProjectGrid projects={[project]} onSelect={() => {}} />);

  expect(screen.getByText('biz-admin')).toBeInTheDocument();
});

it('calls onSelect when a tile is clicked', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<ProjectGrid projects={[project]} onSelect={onSelect} />);

  await user.click(screen.getByRole('button', { name: /biz-admin 프로젝트 상세 보기/ }));

  expect(onSelect).toHaveBeenCalledWith('biz-admin');
});
