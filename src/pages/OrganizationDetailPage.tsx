import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { OrgUnit, SystemId } from '../domain/types';
import {
  orgService,
  participationService,
  peopleService,
  systemsService,
} from '../services';
import { openSystemUrlInNewTab } from '../services/ssoService';

function categoryLabel(type: OrgUnit['type']): string {
  if (type === 'MINISTRY') return 'Ministry';
  if (type === 'TEAM') return 'Team';
  if (type === 'ORGANISATION') return 'Organisation';
  return type;
}

function isBrowseUnit(
  u: OrgUnit,
): u is OrgUnit & { type: 'MINISTRY' | 'TEAM' | 'ORGANISATION' } {
  return (
    u.type === 'MINISTRY' || u.type === 'TEAM' || u.type === 'ORGANISATION'
  );
}

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { openPeerSystem, canEnter, can, authorize, refreshSession } =
    useAuth();
  const canManage = can('ORG_UNIT', 'MANAGE');
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);

  const unit = id ? orgService.getById(id) : null;

  const [name, setName] = useState('');
  const [type, setType] = useState<'MINISTRY' | 'TEAM' | 'ORGANISATION'>(
    'MINISTRY',
  );
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [leaderPersonId, setLeaderPersonId] = useState('');
  const [systemId, setSystemId] = useState('');

  useEffect(() => {
    setMsg('');
    setEditing(false);
    if (unit && isBrowseUnit(unit)) {
      setName(unit.name);
      setType(unit.type);
      setParentId(unit.parentId ?? '');
      setDescription(unit.description ?? '');
      setLeaderPersonId(unit.leaderPersonId ?? '');
      setSystemId(unit.systemId ?? '');
    }
  }, [id]);

  const refresh = () => {
    setTick((t) => t + 1);
    refreshSession();
  };

  if (!unit || !isBrowseUnit(unit)) {
    return <Navigate to="/organization" replace />;
  }

  // Capture narrowed unit for nested handlers (TS does not retain narrowing in closures).
  const browseUnit = unit;

  const parent = browseUnit.parentId
    ? orgService.getById(browseUnit.parentId)
    : null;
  const children = orgService
    .list()
    .filter((u) => u.parentId === browseUnit.id && isBrowseUnit(u));
  const system = browseUnit.systemId
    ? systemsService.getById(browseUnit.systemId)
    : null;
  const roster = participationService.rosterByOrgUnit(browseUnit.id);
  const positions = participationService.positionsByOrgUnit(browseUnit.id);

  const leaderIds = new Set<string>();
  if (browseUnit.leaderPersonId) leaderIds.add(browseUnit.leaderPersonId);
  for (const pos of positions) leaderIds.add(pos.personId);

  const leaders = [...leaderIds].map((personId) => {
    const person = peopleService.getById(personId);
    const titles = positions
      .filter((p) => p.personId === personId)
      .map((p) => p.title);
    if (browseUnit.leaderPersonId === personId && !titles.length) {
      titles.push('Leader');
    } else if (
      browseUnit.leaderPersonId === personId &&
      !titles.some((t) => /leader/i.test(t))
    ) {
      titles.unshift('Leader');
    }
    return { person, titles };
  });

  function syncForm(u: OrgUnit & { type: 'MINISTRY' | 'TEAM' | 'ORGANISATION' }) {
    setName(u.name);
    setType(u.type);
    setParentId(u.parentId ?? '');
    setDescription(u.description ?? '');
    setLeaderPersonId(u.leaderPersonId ?? '');
    setSystemId(u.systemId ?? '');
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    const d = authorize('ORG_UNIT', 'MANAGE');
    if (!d.allowed) {
      setMsg(d.reason);
      return;
    }
    const updated = orgService.update(browseUnit.id, {
      name: name.trim(),
      type,
      parentId: parentId || undefined,
      description: description || undefined,
      leaderPersonId: leaderPersonId || undefined,
      systemId: (systemId || undefined) as SystemId | undefined,
    });
    if (updated && isBrowseUnit(updated)) {
      setMsg(`Updated ${updated.name}`);
      syncForm(updated);
      setEditing(false);
      refresh();
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/organization" className="btn ghost">
          ← Organisation
        </Link>
        {canManage && !editing && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              syncForm(browseUnit);
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="panel stack">
        <div className="org-detail-header">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              {categoryLabel(browseUnit.type)}
              {parent && (
                <>
                  {' '}
                  · under{' '}
                  <Link to={`/organization/${parent.id}`}>{parent.name}</Link>
                </>
              )}
            </p>
            <h2 style={{ margin: '0.25rem 0 0' }}>{browseUnit.name}</h2>
          </div>
          {system && (
            <span
              className={`badge ${system.status === 'PLANNED' ? 'planned' : ''}`}
            >
              {system.shortName} · {system.status}
            </span>
          )}
        </div>
        <p style={{ margin: 0, maxWidth: '42rem' }}>
          {browseUnit.description?.trim() || 'No description yet.'}
        </p>
        {msg && <p className="muted">{msg}</p>}
        {system &&
          system.status === 'ACTIVE' &&
          canEnter(system.id) && (
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const result = openPeerSystem(system.id);
                if (result.ok && result.url) {
                  openSystemUrlInNewTab(result.url);
                } else {
                  window.alert(result.reason ?? 'Cannot open');
                }
              }}
              title="Opens in a new browser tab"
            >
              Open {system.shortName}
            </button>
          </div>
        )}
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Leaders</h3>
        {leaders.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No leaders recorded for this unit yet.
          </p>
        ) : (
          <ul className="org-leader-list">
            {leaders.map(({ person, titles }) => (
              <li key={person?.id ?? titles.join()}>
                {person ? (
                  <Link to={`/people/${person.id}`}>{person.fullName}</Link>
                ) : (
                  <span>Unknown person</span>
                )}
                <span className="muted"> — {titles.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {children.length > 0 && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Related units</h3>
          <div className="org-card-grid">
            {children.map((child) => {
              const childLeader = child.leaderPersonId
                ? peopleService.getById(child.leaderPersonId)
                : null;
              return (
                <article key={child.id} className="panel org-card">
                  <div className="org-card-top">
                    <h3 className="org-card-title">{child.name}</h3>
                    <span className="badge">{categoryLabel(child.type)}</span>
                  </div>
                  <p className="org-card-desc muted">
                    {child.description?.trim() || 'No description yet.'}
                  </p>
                  <div className="org-card-meta muted">
                    {childLeader
                      ? `Led by ${childLeader.preferredName}`
                      : 'Leader not set'}
                  </div>
                  <div className="org-card-actions">
                    <Link
                      className="btn secondary"
                      to={`/organization/${child.id}`}
                    >
                      View detail
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Active members</h3>
        {roster.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No active memberships on this unit.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {roster.length} active member{roster.length === 1 ? '' : 's'} on the
            roster.
          </p>
        )}
      </div>

      {canManage && editing && (
        <form className="panel stack" onSubmit={onSave}>
          <h3 style={{ margin: 0 }}>Edit unit</h3>
          <div className="field">
            <label htmlFor="dname">Name</label>
            <input
              id="dname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="dtype">Category</label>
              <select
                id="dtype"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'MINISTRY' | 'TEAM' | 'ORGANISATION')
                }
              >
                <option value="MINISTRY">Ministry</option>
                <option value="TEAM">Team</option>
                <option value="ORGANISATION">Organisation</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="dparent">Parent</label>
              <select
                id="dparent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">— none —</option>
                {orgService
                  .list()
                  .filter((u) => u.id !== browseUnit.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ddesc">Description</label>
            <textarea
              id="ddesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="dlead">Leader</label>
              <select
                id="dlead"
                value={leaderPersonId}
                onChange={(e) => setLeaderPersonId(e.target.value)}
              >
                <option value="">— none —</option>
                {peopleService.list().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dsys">Linked system</label>
              <select
                id="dsys"
                value={systemId}
                onChange={(e) => setSystemId(e.target.value)}
              >
                <option value="">— none —</option>
                {systemsService.list().map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn">
              Save changes
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                syncForm(unit);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
