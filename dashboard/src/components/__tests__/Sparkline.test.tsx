import { render } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

it('renders an svg with polyline matching data length', () => {
  const { container } = render(<Sparkline data={[100, 95, 100, 90, 100]} accent="#27a644" />);
  const svg = container.querySelector('svg');
  expect(svg).toBeInTheDocument();
  const polyline = svg!.querySelector('polyline');
  expect(polyline).toBeInTheDocument();
  // 5 points → 4 commas
  expect(polyline!.getAttribute('points')!.split(' ')).toHaveLength(5);
});

it('marks failure dots for values < 100', () => {
  const { container } = render(<Sparkline data={[100, 90, 100, 95]} accent="#e5484d" />);
  // 2 failure dots (90, 95) + 1 last dot
  const circles = container.querySelectorAll('circle');
  expect(circles.length).toBe(3);
});

it('renders empty svg when data is empty', () => {
  const { container } = render(<Sparkline data={[]} accent="#27a644" />);
  expect(container.querySelector('polyline')).not.toBeInTheDocument();
});
