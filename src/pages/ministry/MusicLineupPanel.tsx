import { useState } from 'react';
import type { MusicUnitKind } from '../../domain/musicSchedule';
import { musicScheduleService } from '../../services';

const KIND_LABELS: Record<MusicUnitKind, string> = {
  PRIMARY: 'Primary choir',
  SECONDARY: 'Secondary choir',
  CHILDREN: 'Children’s choir',
  WORSHIP: 'Worship team',
};

const KIND_HINTS: Record<MusicUnitKind, string> = {
  PRIMARY:
    'Rotates through Sundays, Tuesday, Friday and Igaburo (at least 2 must stay active).',
  SECONDARY: 'Appears once a month, each on its own Sunday.',
  CHILDREN: 'Serves every first Sunday service (SS1).',
  WORSHIP: 'Serves every Tuesday.',
};

/**
 * Choir lineup: add a choir, retire one, rename. Retired choirs are never
 * scheduled again but stay in published history. Takes effect the next time a
 * schedule is built; schedules already published are not rewritten.
 */
export function MusicLineupPanel({
  canManage,
  onChange,
}: {
  canManage: boolean;
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MusicUnitKind>('PRIMARY');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [msg, setMsg] = useState('');
  const units = musicScheduleService.listUnits();

  function done(r: { ok: boolean; reason?: string }, ok: string) {
    setMsg(r.ok ? ok : (r.reason ?? 'Failed'));
    onChange();
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Choir lineup</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        The schedule is built from the active choirs below. Changes apply the
        next time a schedule is built.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Choir</th>
            <th>Role</th>
            <th>Status</th>
            {canManage ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const active = u.active !== false;
            return (
              <tr key={u.id} style={active ? undefined : { opacity: 0.6 }}>
                <td>{u.name}</td>
                <td>{KIND_LABELS[u.kind]}</td>
                <td>
                  <span className={active ? 'badge' : 'badge planned'}>
                    {active ? 'Active' : 'Retired'}
                  </span>
                </td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => {
                        const r = musicScheduleService.setUnitActive(
                          u.id,
                          !active,
                        );
                        const used = r.stillUsedIn;
                        done(
                          r,
                          active
                            ? `${u.name} retired${used.length ? ` — still on published ${used.join(', ')}; edit those schedules if needed` : ''}`
                            : `${u.name} is active again`,
                        );
                      }}
                    >
                      {active ? 'Retire' : 'Reactivate'}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManage && (
        <form
          className="row"
          style={{ marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            const r = musicScheduleService.addUnit({ name, kind, orgUnitId });
            if (r.ok) {
              setName('');
              setOrgUnitId('');
            }
            done(r, `${r.unit?.name ?? 'Choir'} added`);
          }}
        >
          <label className="field" style={{ margin: 0 }}>
            New choir
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            Role
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MusicUnitKind)}
            >
              {(Object.keys(KIND_LABELS) as MusicUnitKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            Org unit id (optional)
            <input
              type="text"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
              placeholder="ou-choir-…"
            />
          </label>
          <button type="submit" className="btn" disabled={!name.trim()}>
            Add choir
          </button>
        </form>
      )}
      {canManage && (
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
          {KIND_HINTS[kind]} The org unit id links the choir’s members, so
          Protocol only places them on services where their choir sings.
        </p>
      )}
      {msg && <p className="badge" style={{ marginTop: '0.5rem' }}>{msg}</p>}
    </div>
  );
}
