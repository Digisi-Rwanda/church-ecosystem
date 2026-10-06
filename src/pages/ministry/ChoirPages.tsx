import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { choirNavForOffice } from '../../domain/choirNav';
import { choirService } from '../../services';

const SYS = 'sys-choir' as const;

export function ChoirHomePage() {
  const { personName, account } = useAuth();
  const stats = choirService.stats();
  const upcoming = choirService.upcomingRehearsals().slice(0, 3);
  const office = account ? choirService.officeFor(account.personId) : null;

  return (
    <div className="stack">
      <div className="detail-hero">
        <p className="hero-kicker">Choir</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Choir · {personName}</h2>
          {office && account && (
            <span className="persona-chip">
              {choirService.displayOfficeFor(account.personId)}
            </span>
          )}
        </div>
        <div className="overview-strip" style={{ marginTop: '0.85rem' }}>
          <div className="overview-tile">
            <div className="label">Songs ready</div>
            <div className="value">{stats.songsReady}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Rehearsals</div>
            <div className="value">{stats.upcomingRehearsals}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Members</div>
            <div className="value">{stats.rosterCount}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Teams</div>
            <div className="value">{stats.teams}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Upcoming rehearsals</h3>
          {upcoming.length === 0 ? (
            <p className="muted">None scheduled</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {upcoming.map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong>
                  <div className="muted">
                    {new Date(r.startsAt).toLocaleString()} · {r.location}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/systems/choir/rehearsals">All rehearsals →</Link>
        </div>
        <div className="panel">
          <h3>Your pages</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {choirNavForOffice(office)
              .filter((item) => item.key !== 'home')
              .map((item) => (
                <li key={item.key}>
                  <Link to={item.to}>{item.label}</Link>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ChoirRepertoirePage() {
  const { can, authorize } = useAuth();
  const canView = can('CHOIR_REPERTOIRE', 'VIEW', SYS);
  const canManage = can('CHOIR_REPERTOIRE', 'MANAGE', SYS);
  const songs = choirService.listSongs();

  if (!canView) {
    return (
      <div className="panel">
        <h2>Repertoire</h2>
        <p className="muted">No CHOIR_REPERTOIRE / VIEW</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Repertoire</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Songs for worship and concerts
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              className="btn"
              onClick={() => authorize('CHOIR_REPERTOIRE', 'MANAGE', SYS)}
            >
              Manage
            </button>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Composer</th>
              <th>Language</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.title}</strong>
                  {s.notes && <div className="muted">{s.notes}</div>}
                </td>
                <td>{s.composer ?? '—'}</td>
                <td>{s.language ?? '—'}</td>
                <td>
                  <span
                    className={`badge ${s.status === 'ARCHIVED' ? 'planned' : ''}`}
                  >
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChoirRehearsalsPage() {
  const { can } = useAuth();
  const canView = can('CHOIR_REPERTOIRE', 'VIEW', SYS);
  const rehearsals = choirService.listRehearsals();

  if (!canView) {
    return (
      <div className="panel">
        <h2>Rehearsals</h2>
        <p className="muted">No view rights</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2>Rehearsals</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Title</th>
              <th>Location</th>
              <th>Songs</th>
            </tr>
          </thead>
          <tbody>
            {rehearsals.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.startsAt).toLocaleString()}</td>
                <td>
                  <strong>{r.title}</strong>
                  {r.notes && <div className="muted">{r.notes}</div>}
                </td>
                <td>{r.location ?? '—'}</td>
                <td>
                  {r.songIds
                    .map((id) => choirService.getSong(id)?.title ?? id)
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

