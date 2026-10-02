import { useEffect, useMemo, useState } from 'react';
import { apiSearchPeople, type DirectoryPerson } from '../../api/peopleApi';
import { Drawer } from '../../components/ui/Drawer';
import { useToast } from '../../components/ui/Toast';
import type { ProtocolRosterMember, ServeDayCapability } from '../../domain/types';
import { activeMusicUnits, musicUnitName } from '../../domain/musicUnits';
import { authService, peopleService, protocolService } from '../../services';

const SERVE: Record<ServeDayCapability, string> = {
  BOTH: 'Sundays and Tuesdays',
  SUNDAY: 'Sundays only',
  TUESDAY: 'Tuesdays only',
};
const SETTABLE = ['MEMBER', 'SECRETARY', 'TREASURER'] as const;

/** Search the church directory: the server's when signed in to it, else this browser's. */
function useDirectory(q: string, enabled: boolean) {
  const [rows, setRows] = useState<DirectoryPerson[]>([]);
  const [doneFor, setDoneFor] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        if (authService.authSource() === 'api') {
          const r = await apiSearchPeople(q.trim());
          if (live) setRows(r.people);
        } else {
          const r = peopleService.search(q.trim()).slice(0, 25);
          if (live)
            setRows(
              r.map((p) => ({
                id: p.id,
                fullName: p.fullName,
                preferredName: p.preferredName,
                email: p.email,
              })),
            );
        }
        if (live) setError('');
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (live) setDoneFor(q.trim());
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, enabled]);
  const active = enabled && q.trim().length >= 2;
  return { rows: active ? rows : [], busy: active && doneFor !== q.trim(), error: active ? error : '' };
}

export function ProtocolRosterManager({
  canManage,
  actorPersonId,
}: {
  canManage: boolean;
  actorPersonId?: string;
}) {
  const { push } = useToast();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const roster = useMemo(
    () => protocolService.rosterWithNames(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const shown = roster.filter((m) => showInactive || m.status !== 'INACTIVE');
  const edit = editing ? (roster.find((m) => m.id === editing) ?? null) : null;
  const iCan = canManage && !!actorPersonId && protocolService.isCoordinator(actorPersonId);
  const done = (ok: boolean, okMsg: string, reason?: string) =>
    push({ title: ok ? okMsg : (reason ?? 'Failed'), tone: ok ? 'success' : 'danger' });

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Protocol roster</h2>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {roster.filter((m) => m.status === 'ACTIVE').length} active ·{' '}
            {roster.filter((m) => m.status === 'LEAVE').length} on leave
          </p>
        </div>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: '0.35rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span className="muted">Show inactive</span>
          </label>
          {iCan && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              Add member
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Office</th>
              <th>Choir</th>
              <th>Serve days</th>
              <th>Status</th>
              <th>Unavailable</th>
              <th>Notes</th>
              {iCan && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} style={m.status === 'INACTIVE' ? { opacity: 0.6 } : undefined}>
                <td>{m.name}</td>
                <td className="muted">{peopleService.getById(m.personId)?.email ?? m.email ?? '—'}</td>
                <td>{protocolService.officeLabel(m.office)}</td>
                <td>{m.choirUnitId ? musicUnitName(m.choirUnitId) : <span className="muted">None</span>}</td>
                <td>{SERVE[m.serveDays]}</td>
                <td>
                  <span className={m.status === 'ACTIVE' ? 'badge' : 'badge planned'}>{m.status}</span>
                </td>
                <td className="muted">{m.unavailableDates.length ? m.unavailableDates.join(', ') : '—'}</td>
                <td className="muted">{m.notes ?? '—'}</td>
                {iCan && (
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(m.id)}>
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={iCan ? 9 : 8} className="muted">
                  No one on the roster yet.{iCan ? ' Use Add member to start it.' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddMember
          onClose={() => setAdding(false)}
          onAdd={(input) => {
            const r = protocolService.rosterAdd(input, actorPersonId!);
            done(r.ok, `${input.displayName ?? 'Member'} added`, r.reason);
            if (r.ok) {
              setAdding(false);
              refresh();
            }
          }}
        />
      )}

      {edit && (
        <EditMember
          key={edit.id}
          member={edit}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            const r = protocolService.rosterUpdate(edit.id, patch, actorPersonId!);
            done(r.ok, 'Saved', r.reason);
            if (r.ok) {
              setEditing(null);
              refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function AddMember({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (i: {
    personId: string;
    displayName: string;
    email?: string;
    office: (typeof SETTABLE)[number];
    serveDays: ServeDayCapability;
    notes?: string;
  }) => void;
}) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<DirectoryPerson | null>(null);
  const [office, setOffice] = useState<(typeof SETTABLE)[number]>('MEMBER');
  const [serveDays, setServeDays] = useState<ServeDayCapability>('BOTH');
  const [notes, setNotes] = useState('');
  const dir = useDirectory(q, !pick);
  const onRoster = (id: string) => protocolService.listRoster().some((m) => m.personId === id && m.status !== 'INACTIVE');

  return (
    <Drawer
      open
      title="Add a roster member"
      subtitle="Pick someone from the church directory"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!pick}
            onClick={() =>
              pick &&
              onAdd({
                personId: pick.id,
                displayName: pick.preferredName || pick.fullName,
                email: pick.email ?? undefined,
                office,
                serveDays,
                notes,
              })
            }
          >
            Add to roster
          </button>
        </>
      }
    >
      <div className="stack">
        {!pick ? (
          <>
            <input
              autoFocus
              placeholder="Search by name, phone or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the directory"
            />
            {q.trim().length < 2 && <p className="muted">Type at least two letters.</p>}
            {dir.busy && <p className="muted">Searching…</p>}
            {dir.error && <p className="muted" style={{ color: 'var(--danger)' }}>{dir.error}</p>}
            <ul className="duty-list">
              {dir.rows.map((p) => (
                <li key={p.id}>
                  <span>
                    <strong>{p.fullName}</strong>
                    <span className="muted"> {p.email ?? p.phone ?? ''}</span>
                  </span>
                  {onRoster(p.id) ? (
                    <span className="pill">On the roster</span>
                  ) : (
                    <button type="button" className="btn secondary sm" onClick={() => setPick(p)}>
                      Choose
                    </button>
                  )}
                </li>
              ))}
              {!dir.busy && q.trim().length >= 2 && dir.rows.length === 0 && !dir.error && (
                <li className="muted">No one found. Church members must be registered in the directory first.</li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{pick.fullName}</strong>
              <button type="button" className="btn ghost sm" onClick={() => setPick(null)}>
                Change
              </button>
            </div>
            <RosterFields
              office={office}
              serveDays={serveDays}
              notes={notes}
              onOffice={setOffice}
              onServe={setServeDays}
              onNotes={setNotes}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}

function RosterFields({
  office,
  serveDays,
  notes,
  onOffice,
  onServe,
  onNotes,
  officeLocked,
}: {
  office: ProtocolRosterMember['office'];
  serveDays: ServeDayCapability;
  notes: string;
  onOffice: (o: (typeof SETTABLE)[number]) => void;
  onServe: (s: ServeDayCapability) => void;
  onNotes: (n: string) => void;
  officeLocked?: boolean;
}) {
  return (
    <>
      <label className="stack" style={{ gap: '0.25rem' }}>
        <span className="muted">Office</span>
        <select
          value={office}
          disabled={officeLocked}
          onChange={(e) => onOffice(e.target.value as (typeof SETTABLE)[number])}
        >
          {officeLocked ? (
            <option value={office}>{protocolService.officeLabel(office)}</option>
          ) : (
            SETTABLE.map((o) => (
              <option key={o} value={o}>
                {protocolService.officeLabel(o)}
              </option>
            ))
          )}
        </select>
        {officeLocked && (
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Coordinator, President and Vice President follow the church positions.
          </span>
        )}
      </label>
      <label className="stack" style={{ gap: '0.25rem' }}>
        <span className="muted">Serves on</span>
        <select value={serveDays} onChange={(e) => onServe(e.target.value as ServeDayCapability)}>
          {(Object.keys(SERVE) as ServeDayCapability[]).map((k) => (
            <option key={k} value={k}>
              {SERVE[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="stack" style={{ gap: '0.25rem' }}>
        <span className="muted">Notes</span>
        <input value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="e.g. Integuza Choir" />
      </label>
    </>
  );
}

function EditMember({
  member,
  onClose,
  onSave,
}: {
  member: ProtocolRosterMember & { name: string };
  onClose: () => void;
  onSave: (p: {
    office?: (typeof SETTABLE)[number];
    serveDays: ServeDayCapability;
    status: ProtocolRosterMember['status'];
    unavailableDates: string[];
    notes: string;
    choirUnitId: string;
  }) => void;
}) {
  const locked = !(SETTABLE as readonly string[]).includes(member.office);
  const [office, setOffice] = useState<(typeof SETTABLE)[number]>(
    locked ? 'MEMBER' : (member.office as (typeof SETTABLE)[number]),
  );
  const [serveDays, setServeDays] = useState(member.serveDays);
  const [status, setStatus] = useState(member.status);
  const [dates, setDates] = useState(member.unavailableDates.join('\n'));
  const [notes, setNotes] = useState(member.notes ?? '');
  const [choir, setChoir] = useState(member.choirUnitId ?? '');

  return (
    <Drawer
      open
      title={member.name}
      subtitle="Roster entry"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onSave({
                ...(locked ? {} : { office }),
                serveDays,
                status,
                unavailableDates: dates
                  .split(/[\s,;]+/)
                  .map((d) => d.trim())
                  .filter(Boolean),
                notes,
                choirUnitId: choir,
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <RosterFields
          office={locked ? member.office : office}
          serveDays={serveDays}
          notes={notes}
          onOffice={setOffice}
          onServe={setServeDays}
          onNotes={setNotes}
          officeLocked={locked}
        />
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Choir</span>
          <select value={choir} onChange={(e) => setChoir(e.target.value)}>
            <option value="">None</option>
            {activeMusicUnits().map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ACTIVE">Active</option>
            <option value="LEAVE">On leave (not scheduled)</option>
            <option value="INACTIVE" disabled={member.office === 'COORDINATOR'}>
              Inactive (left the team)
            </option>
          </select>
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Dates not available (one per line, YYYY-MM-DD)</span>
          <textarea rows={4} value={dates} onChange={(e) => setDates(e.target.value)} />
        </label>
      </div>
    </Drawer>
  );
}
