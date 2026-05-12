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
      {projects.map(project => (
        <ProjectTile key={project.name} project={project} onSelect={onSelect} />
      ))}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
  gap: 12,
};
