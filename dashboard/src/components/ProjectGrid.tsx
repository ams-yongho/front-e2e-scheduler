import type { CSSProperties } from 'react';
import type { ProjectData } from '../App';
import { ProjectTile } from './ProjectTile';

type Props = {
  projects: ProjectData[];
  onSelect: (projectName: string) => void;
};

export function ProjectGrid({ projects, onSelect }: Props) {
  return (
    <div style={gridStyle}>
      {projects.map(p => (
        <ProjectTile
          key={p.name}
          name={p.name}
          registered={p.registered}
          e2eLatest={p.e2eLatest}
          e2eTrend={p.e2eTrend}
          unitLatest={p.unitLatest}
          onSelect={() => onSelect(p.name)}
        />
      ))}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
  gap: 12,
};
