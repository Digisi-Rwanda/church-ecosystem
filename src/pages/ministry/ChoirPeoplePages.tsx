import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { choirService } from '../../services';

const SYS = 'sys-choir' as const;

export function ChoirTeamsPage() {
  const { can } = useAuth();
  const canView = can('CHOIR_ROSTER', 'VIEW', SYS);
  const teams = choirService.listTeams();

  if (!canView) {
    return (
      <div className="panel">
        <h2>Teams</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Teams</h2>
        <p className="muted">
          Internal choir teams, each with a leader and a vice leader. Not household
          relatives.
        </p>
        {teams.map((t) => (
          <div key={t.id} style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.25rem' }}>
              {t.name}{' '}
              <span className="badge">{t.code}</span>
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              Leader: {t.leaderName ?? '—'} · {t.memberCount} members
            </p>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
              {choirService.teamMembers(t.id).map((m) => (
                <li key={m.id}>{m.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChoirPeoplePage() {
  const { can, canViewPeople, account } = useAuth();
  const canView = can('CHOIR_ROSTER', 'VIEW', SYS) && canViewPeople;
  const roster = choirService.listRoster();

  if (!canViewPeople && account) {
    return <Navigate to={`/people/${account.personId}`} replace />;
  }

  if (!canView) {
    return (
      <div className="panel">
        <h2>People</h2>
        <p className="muted">
          Choir people directory is for ministry leaders only.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Choir people</h2>
        <p className="muted">Offices and team assignment</p>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Office</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{choirService.officeLabel(m.office, m.advisorRole)}</td>
                <td>{m.teamName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
