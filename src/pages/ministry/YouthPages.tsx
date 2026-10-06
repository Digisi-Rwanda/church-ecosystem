import { Link } from 'react-router-dom';
import { missionService } from '../../services';
import { MinistryHomeCard } from './MinistryShell';
import { MinistryMissionBoard } from './MinistryMissionBoard';

const SYS = 'sys-youth' as const;

export function YouthHomePage() {
  const programs = missionService.listPrograms({
    ownerSystemId: SYS,
    status: 'ACTIVE',
  });
  const events = missionService
    .listEvents()
    .filter((e) => e.ownerSystemId === SYS);

  return (
    <div className="stack">
      <MinistryHomeCard title="Youth System">
        <p className="muted" style={{ marginTop: 0 }}>
          Programs, events, and activities for youth discipleship. Sunday School
          belongs to Children Ministry — not Youth.
        </p>
        <div className="row">
          <span className="badge">{programs.length} active programs</span>
          <span className="badge">{events.length} events</span>
        </div>
      </MinistryHomeCard>

      <div className="grid-2">
        <div className="panel">
          <h3>Active programs</h3>
          {programs.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {programs.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  {p.scheduleHint ? (
                    <div className="muted">{p.scheduleHint}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h3>Work here</h3>
          <div className="stack" style={{ gap: '0.5rem' }}>
            <Link to="/systems/youth/mission">
              Mission board — programs · events · tasks · projects
            </Link>
            <Link to="/systems/youth/programs">Programs</Link>
            <Link to="/systems/youth/events">Events</Link>
            <Link to="/systems/youth/tasks">Tasks</Link>
            <Link to="/systems/youth/projects">Projects</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function YouthMissionPage() {
  return (
    <MinistryMissionBoard systemId={SYS} title="Youth mission board" />
  );
}
