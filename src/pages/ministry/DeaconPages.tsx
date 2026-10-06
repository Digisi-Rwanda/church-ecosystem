import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { deaconService } from '../../services';
import { MinistryHomeCard } from './MinistryShell';

const SYS = 'sys-deacon' as const;

export function DeaconHomePage() {
  const { personName } = useAuth();
  const stats = deaconService.stats();

  return (
    <div className="stack">
      <MinistryHomeCard title="Deacon System">
        <p className="muted" style={{ marginTop: 0 }}>
          Private care ministry. Protocol sits under Deacon in the structure but
          works on its own.
        </p>
        <div className="row">
          <span className="badge">{stats.rosterCount} on roster</span>
          <span className="badge">Signed in as {personName}</span>
        </div>
      </MinistryHomeCard>

      <div className="panel">
        <h3>Quick links</h3>
        <div className="stack" style={{ gap: '0.5rem' }}>
          <Link to="/systems/deacon/roster">Roster</Link>
          <Link to="/systems/protocol">Protocol →</Link>
        </div>
      </div>
    </div>
  );
}

export function DeaconRosterPage() {
  const { can } = useAuth();
  const canView = can('DEACON_ROSTER', 'VIEW', SYS);
  const roster = deaconService.listRoster(false);

  if (!canView) {
    return (
      <div className="panel">
        <h2>Roster</h2>
        <p className="muted">No DEACON_ROSTER / VIEW</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Deacon roster</h2>
      <p className="muted">Offices drive care and vault entitlements</p>
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Office</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((m) => (
            <tr key={m.id}>
              <td>{deaconService.personLabel(m.personId)}</td>
              <td>{deaconService.officeLabel(m.office)}</td>
              <td>
                <span
                  className={`badge ${m.status === 'INACTIVE' ? 'planned' : ''}`}
                >
                  {m.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
