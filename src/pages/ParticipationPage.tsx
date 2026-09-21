import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { membershipTypeLabel, roleLabel } from '../domain/access';
import { useAuth } from '../auth/AuthContext';
import { Drawer } from '../components/ui/Drawer';
import {
  CheckboxField,
  SelectField,
  TextField,
} from '../components/ui/Field';
import { FilterBar } from '../components/ui/FilterBar';
import {
  EmptyState,
  StatusPill,
} from '../components/ui/StatusPill';
import type {
  AssignmentContextType,
  MembershipType,
  MissionLeaderOffice,
  SystemId,
  SystemRole,
} from '../domain/types';
import {
  buildParticipationWork,
  kindLabel,
  orgService,
  participationService,
  peopleService,
  systemsService,
} from '../services';

type CreateKind = 'membership' | 'position' | 'assignment' | null;
type RegistryFilter = 'all' | 'memberships' | 'positions' | 'assignments';

export function ParticipationPage() {
  const {
    account,
    personName,
    memberships,
    positions,
    assignments,
    entitlements,
    roles,
    tasks,
    can,
    authorize,
    refreshSession,
  } = useAuth();
  const personId = account?.personId ?? '';
  const workBySystem = personId
    ? buildParticipationWork({
        personId,
        roles,
        positions,
        tasks,
        entitlementSystemIds: entitlements.map((e) => e.systemId),
      })
    : [];
  const openWorkCount = workBySystem.reduce((n, s) => n + s.items.length, 0);
  const canManageRegistry =
    can('MEMBERSHIP', 'MANAGE') ||
    can('POSITION', 'MANAGE') ||
    can('ASSIGNMENT', 'MANAGE');
  const people = peopleService.list();
  const orgs = orgService.list();
  const systems = systemsService.list();
  const activeSystems = systemsService.listActive();
  const assignableSystems = activeSystems.filter((s) =>
    can('ASSIGNMENT', 'MANAGE', s.id),
  );
  const canCreateAssignment = assignableSystems.length > 0;
  const canManage = canManageRegistry || canCreateAssignment;
  const [, setTick] = useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    refreshSession();
  };
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'mine' | 'manage'>('mine');
  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [registryFilter, setRegistryFilter] =
    useState<RegistryFilter>('all');

  const allMemberships = participationService.listMemberships();
  const allPositions = participationService.listPositions();
  const allAssignments = participationService.listAssignments();

  const [mPerson, setMPerson] = useState('');
  const [mType, setMType] = useState<MembershipType>('CHURCH_MEMBER');
  const [mOrg, setMOrg] = useState('');
  const [mSystem, setMSystem] = useState('');

  const [pPerson, setPPerson] = useState('');
  const [pTitle, setPTitle] = useState('');
  const [pOrg, setPOrg] = useState('');
  const [pRole, setPRole] = useState<SystemRole | ''>('');
  const [pOffice, setPOffice] = useState<MissionLeaderOffice | ''>('');
  const [pSystem, setPSystem] = useState('');
  const [pAllSystems, setPAllSystems] = useState(false);

  const [aPerson, setAPerson] = useState('');
  const [aTitle, setATitle] = useState('');
  const [aLabel, setALabel] = useState('');
  const [aContextType, setAContextType] =
    useState<AssignmentContextType>('EVENT');
  const [aSystem, setASystem] = useState('');
  const [aOrg, setAOrg] = useState('');
  const [aEnd, setAEnd] = useState('');

  function openAssignmentDrawer() {
    const preferred =
      assignableSystems.find((s) => s.id === 'sys-main')?.id ??
      assignableSystems[0]?.id ??
      '';
    setASystem(preferred);
    setAOrg('');
    setCreateKind('assignment');
  }

  function onAddMembership(e: FormEvent) {
    e.preventDefault();
    const d = authorize('MEMBERSHIP', 'MANAGE');
    if (!d.allowed) {
      setMsg(d.reason);
      return;
    }
    participationService.createMembership({
      personId: mPerson,
      type: mType,
      label: membershipTypeLabel(mType),
      orgUnitId: mOrg || undefined,
      systemId: (mSystem || undefined) as SystemId | undefined,
    });
    setMsg('Membership added');
    setMPerson('');
    setCreateKind(null);
    refresh();
  }

  function onAddPosition(e: FormEvent) {
    e.preventDefault();
    const d = authorize('POSITION', 'MANAGE');
    if (!d.allowed) {
      setMsg(d.reason);
      return;
    }
    participationService.createPosition({
      personId: pPerson,
      title: pTitle.trim(),
      orgUnitId: pOrg,
      systemRole: pRole || undefined,
      ministryOffice: pOffice || undefined,
      grantsAllSystems: pAllSystems || undefined,
      systemId: (pSystem || undefined) as SystemId | undefined,
    });
    setMsg('Position added');
    setPTitle('');
    setPPerson('');
    setCreateKind(null);
    refresh();
  }

  function onAddAssignment(e: FormEvent) {
    e.preventDefault();
    if (!aPerson || !aTitle.trim()) {
      setMsg('Person and title are required');
      return;
    }
    if (!aSystem) {
      setMsg('Choose the system this assignment belongs to');
      return;
    }
    const systemId = aSystem as SystemId;
    const d = authorize('ASSIGNMENT', 'MANAGE', systemId);
    if (!d.allowed) {
      setMsg(d.reason);
      return;
    }
    const org =
      aOrg ||
      orgs.find((o) => o.systemId === systemId)?.id ||
      undefined;
    participationService.createAssignment({
      personId: aPerson,
      title: aTitle.trim(),
      contextType: aContextType,
      contextId: `ctx-${Date.now()}`,
      contextLabel: aLabel.trim() || aTitle.trim(),
      orgUnitId: org,
      systemId,
      endDate: aEnd || undefined,
    });
    setMsg('Assignment created');
    setATitle('');
    setAPerson('');
    setALabel('');
    setAEnd('');
    setAOrg('');
    setCreateKind(null);
    refresh();
  }

  const orgsForAssignment = aSystem
    ? orgs.filter((o) => !o.systemId || o.systemId === aSystem)
    : orgs;

  return (
    <div className="stack">
      <div className="detail-hero">
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn sm ${tab === 'mine' ? '' : 'ghost'}`}
            onClick={() => setTab('mine')}
          >
            My participation
          </button>
          {canManage && (
            <button
              type="button"
              className={`btn sm ${tab === 'manage' ? '' : 'ghost'}`}
              onClick={() => setTab('manage')}
            >
              Manage registry
            </button>
          )}
        </div>
        <div className="overview-strip" style={{ marginTop: '0.85rem' }}>
          <div className="overview-tile">
            <div className="label">Roles</div>
            <div className="value">{roles.length || '—'}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Memberships</div>
            <div className="value">{memberships.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Positions</div>
            <div className="value">{positions.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Open work</div>
            <div className="value">{openWorkCount || '—'}</div>
          </div>
        </div>
        {msg && <p className="badge">{msg}</p>}
      </div>

      {tab === 'mine' && (
        <>
          <div className="panel part-work-desk">
            <div className="part-work-desk-head">
              <div>
                <h3 style={{ margin: 0 }}>Your work by system</h3>
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  {personName} — filed by desk: decisions, care, board, pulpit,
                  tasks, and what’s coming up. Not access rights.
                </p>
              </div>
              <div className="part-work-role-row">
                {roles.map((r) => (
                  <span key={r} className="badge">
                    {roleLabel(r)}
                  </span>
                ))}
              </div>
            </div>
            {workBySystem.length === 0 ? (
              <EmptyState
                title="Nothing waiting on you"
                detail="When tasks, approvals, or upcoming events need you, they show up here by system."
              />
            ) : (
              <div className="part-work-systems">
                {workBySystem.map((sys) => (
                  <section key={sys.systemId} className="part-work-system">
                    <header className="part-work-system-head">
                      <div>
                        <p className="part-work-system-kicker">System desk</p>
                        <h4>
                          <Link to={sys.basePath || '/'}>{sys.shortName}</Link>
                        </h4>
                      </div>
                      <span className="part-work-count">
                        {sys.items.length} open
                      </span>
                    </header>
                    <div className="part-work-trays">
                      {sys.trays.map((tray) => (
                        <div
                          key={tray.category}
                          className={`part-work-tray tray-${tray.category}`}
                        >
                          <div className="part-work-tray-head">
                            <h5>{tray.label}</h5>
                            <span className="muted">{tray.items.length}</span>
                          </div>
                          <ul className="part-work-list">
                            {tray.items.map((item) => (
                              <li
                                key={item.id}
                                className={`part-work-row${item.urgent ? ' urgent' : ''}`}
                              >
                                <div className="part-work-row-main">
                                  <div className="part-work-meta">
                                    <span className="part-work-kind">
                                      {kindLabel(item.kind)}
                                    </span>
                                    {item.dueDate ? (
                                      <span className="part-work-due">
                                        {item.dueDate}
                                      </span>
                                    ) : null}
                                  </div>
                                  <Link
                                    className="part-work-title"
                                    to={item.href}
                                  >
                                    {item.title}
                                  </Link>
                                  {item.detail ? (
                                    <p className="part-work-detail muted">
                                      {item.detail}
                                    </p>
                                  ) : null}
                                </div>
                                <Link
                                  className="btn sm secondary part-work-open"
                                  to={item.href}
                                >
                                  Open
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>My memberships</h3>
            <SimpleMembershipTable rows={memberships} />
          </div>
          <div className="panel">
            <h3>My positions</h3>
            <SimplePositionTable rows={positions} />
          </div>
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>My assignments</h3>
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Temporary roles you hold. Leaders can also assign others in
                  their system.
                </p>
              </div>
              {canCreateAssignment && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={openAssignmentDrawer}
                >
                  Create assignment
                </button>
              )}
            </div>
            {assignments.length === 0 ? (
              <EmptyState
                title="No assignments on you"
                detail={
                  canCreateAssignment
                    ? 'Nothing assigned to you yet. Use Create assignment to give someone a temporary role in your scope.'
                    : 'None active for you.'
                }
                action={
                  canCreateAssignment ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={openAssignmentDrawer}
                    >
                      Create assignment
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Context</th>
                    <th>System</th>
                    <th>Until</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{a.contextLabel}</td>
                      <td>
                        {a.systemId
                          ? systemsService.getById(a.systemId)?.shortName
                          : '—'}
                      </td>
                      <td>{a.endDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'manage' && canManage && (
        <div className="stack">
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>Church registry</h3>
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Dense tables stay here — creates open in drawers.
                </p>
              </div>
              <div className="row">
                {can('MEMBERSHIP', 'MANAGE') && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setCreateKind('membership')}
                  >
                    Add membership
                  </button>
                )}
                {can('POSITION', 'MANAGE') && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setCreateKind('position')}
                  >
                    Add position
                  </button>
                )}
                {can('ASSIGNMENT', 'MANAGE') || canCreateAssignment ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={openAssignmentDrawer}
                  >
                    Add assignment
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <FilterBar
                value={registryFilter}
                onChange={(v) => setRegistryFilter(v as RegistryFilter)}
                options={[
                  {
                    value: 'all',
                    label: 'All',
                    count:
                      allMemberships.length +
                      allPositions.length +
                      allAssignments.length,
                  },
                  {
                    value: 'memberships',
                    label: 'Memberships',
                    count: allMemberships.length,
                  },
                  {
                    value: 'positions',
                    label: 'Positions',
                    count: allPositions.length,
                  },
                  {
                    value: 'assignments',
                    label: 'Assignments',
                    count: allAssignments.length,
                  },
                ]}
              />
            </div>
          </div>

          {(registryFilter === 'all' || registryFilter === 'memberships') && (
            <div className="panel">
              <h3>Memberships</h3>
              {allMemberships.length === 0 ? (
                <EmptyState
                  title="No memberships"
                  action={
                    can('MEMBERSHIP', 'MANAGE') ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setCreateKind('membership')}
                      >
                        Add membership
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Type</th>
                      <th>Org</th>
                      <th>System</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allMemberships.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <Link to={`/people/${m.personId}`}>
                            {peopleService.getById(m.personId)?.preferredName ??
                              m.personId}
                          </Link>
                        </td>
                        <td>{membershipTypeLabel(m.type)}</td>
                        <td>
                          {m.orgUnitId
                            ? orgService.getById(m.orgUnitId)?.name
                            : '—'}
                        </td>
                        <td>
                          {m.systemId
                            ? systemsService.getById(m.systemId)?.shortName
                            : '—'}
                        </td>
                        <td>
                          <StatusPill status={m.status}>{m.status}</StatusPill>
                        </td>
                        <td>
                          {m.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                authorize('MEMBERSHIP', 'MANAGE');
                                participationService.endMembership(m.id);
                                refresh();
                              }}
                            >
                              End
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(registryFilter === 'all' || registryFilter === 'positions') && (
            <div className="panel">
              <h3>Positions</h3>
              {allPositions.length === 0 ? (
                <EmptyState
                  title="No positions"
                  action={
                    can('POSITION', 'MANAGE') ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setCreateKind('position')}
                      >
                        Add position
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Title</th>
                      <th>Org</th>
                      <th>Role / office</th>
                      <th>System</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allPositions.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {peopleService.getById(p.personId)?.preferredName ??
                            p.personId}
                        </td>
                        <td>{p.title}</td>
                        <td>{orgService.getById(p.orgUnitId)?.name}</td>
                        <td>
                          {p.systemRole ? roleLabel(p.systemRole) : '—'}
                          {p.ministryOffice ? ` · ${p.ministryOffice}` : ''}
                        </td>
                        <td>
                          {p.grantsAllSystems
                            ? 'All'
                            : p.systemId
                              ? systemsService.getById(p.systemId)?.shortName
                              : '—'}
                        </td>
                        <td>
                          <StatusPill status={p.status}>{p.status}</StatusPill>
                        </td>
                        <td>
                          {p.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                authorize('POSITION', 'MANAGE');
                                participationService.endPosition(p.id);
                                refresh();
                              }}
                            >
                              End
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(registryFilter === 'all' || registryFilter === 'assignments') && (
            <div className="panel">
              <h3>Assignments</h3>
              {allAssignments.length === 0 ? (
                <EmptyState
                  title="No assignments"
                  detail="Create a temporary role for someone in your system scope."
                  action={
                    canCreateAssignment ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={openAssignmentDrawer}
                      >
                        Create assignment
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Title</th>
                      <th>Context</th>
                      <th>System</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allAssignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {peopleService.getById(a.personId)?.preferredName ??
                            a.personId}
                        </td>
                        <td>{a.title}</td>
                        <td>{a.contextLabel}</td>
                        <td>
                          {a.systemId
                            ? systemsService.getById(a.systemId)?.shortName
                            : '—'}
                        </td>
                        <td>
                          <StatusPill status={a.status}>{a.status}</StatusPill>
                        </td>
                        <td>
                          {a.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                authorize('ASSIGNMENT', 'MANAGE');
                                participationService.completeAssignment(a.id);
                                refresh();
                              }}
                            >
                              Complete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <Drawer
            open={createKind === 'membership'}
            title="Add membership"
            onClose={() => setCreateKind(null)}
            wide
          >
            <form className="stack" onSubmit={onAddMembership}>
              <SelectField
                label="Person"
                name="mPerson"
                id="mPerson"
                value={mPerson}
                onChange={(e) => setMPerson(e.target.value)}
                required
              >
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Type"
                name="mType"
                id="mType"
                value={mType}
                onChange={(e) => setMType(e.target.value as MembershipType)}
              >
                {(
                  [
                    'CHURCH_MEMBER',
                    'CHOIR_MEMBER',
                    'WORSHIP_MEMBER',
                    'YOUTH_MEMBER',
                    'PROTOCOL_MEMBER',
                    'DEACON_MEMBER',
                    'MEDIA_MEMBER',
                    'MUSIC_MEMBER',
                    'MEN_MEMBER',
                    'WOMEN_MEMBER',
                    'COUPLES_MEMBER',
                    'CHILDREN_MEMBER',
                    'ELDERLY_MEMBER',
                    'EVANGELISM_MEMBER',
                    'INTERCESSORS_MEMBER',
                  ] as MembershipType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {membershipTypeLabel(t)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Org unit"
                name="mOrg"
                id="mOrg"
                value={mOrg}
                onChange={(e) => setMOrg(e.target.value)}
              >
                <option value="">—</option>
                {orgs.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="System (entry)"
                name="mSystem"
                id="mSystem"
                value={mSystem}
                onChange={(e) => setMSystem(e.target.value)}
              >
                <option value="">—</option>
                {activeSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
              </SelectField>
              <button type="submit" className="btn">
                Add membership
              </button>
            </form>
          </Drawer>

          <Drawer
            open={createKind === 'position'}
            title="Add position"
            onClose={() => setCreateKind(null)}
            wide
          >
            <form className="stack" onSubmit={onAddPosition}>
              <SelectField
                label="Person"
                name="pPerson"
                id="pPerson"
                value={pPerson}
                onChange={(e) => setPPerson(e.target.value)}
                required
              >
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Title"
                name="pTitle"
                id="pTitle"
                value={pTitle}
                onChange={(e) => setPTitle(e.target.value)}
                required
              />
              <SelectField
                label="Org unit"
                name="pOrg"
                id="pOrg"
                value={pOrg}
                onChange={(e) => setPOrg(e.target.value)}
                required
              >
                <option value="">—</option>
                {orgs.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="System"
                name="pSystem"
                id="pSystem"
                value={pSystem}
                onChange={(e) => setPSystem(e.target.value)}
              >
                <option value="">—</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="System role"
                name="pRole"
                id="pRole"
                value={pRole}
                onChange={(e) =>
                  setPRole(e.target.value as SystemRole | '')
                }
              >
                <option value="">—</option>
                {(
                  [
                    'CHURCH_LEADER',
                    'PASTOR',
                    'CATECHIST',
                    'CHURCH_SECRETARY',
                    'CHURCH_TREASURER',
                    'CHOIR_LEADER',
                    'WORSHIP_LEADER',
                    'YOUTH_LEADER',
                    'PROTOCOL_LEADER',
                    'DEACON_LEADER',
                    'LIMITED_STAFF',
                  ] as SystemRole[]
                ).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Mission office"
                name="pOffice"
                id="pOffice"
                value={pOffice}
                onChange={(e) =>
                  setPOffice(e.target.value as MissionLeaderOffice | '')
                }
              >
                <option value="">—</option>
                <option value="PRESIDENT">President</option>
                <option value="VP">VP</option>
                <option value="SECRETARY">Secretary</option>
                <option value="TREASURER">Treasurer</option>
              </SelectField>
              <CheckboxField
                label="Grants all systems (governance)"
                id="pAllSystems"
                checked={pAllSystems}
                onChange={setPAllSystems}
              />
              <button type="submit" className="btn">
                Add position
              </button>
            </form>
          </Drawer>
        </div>
      )}

      <Drawer
        open={createKind === 'assignment'}
        title="Create assignment"
        onClose={() => setCreateKind(null)}
        wide
      >
        <form className="stack" onSubmit={onAddAssignment}>
          <p className="muted" style={{ margin: 0 }}>
            Temporary role in a system you lead. Church Leader can assign across
            church systems; ministry leaders only within their own.
          </p>
          <SelectField
            label="Person"
            name="aPerson"
            id="aPerson"
            value={aPerson}
            onChange={(e) => setAPerson(e.target.value)}
            required
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Title"
            name="aTitle"
            id="aTitle"
            value={aTitle}
            onChange={(e) => setATitle(e.target.value)}
            required
            placeholder="e.g. Registration coordinator"
          />
          <SelectField
            label="Context type"
            name="aContextType"
            id="aContextType"
            value={aContextType}
            onChange={(e) =>
              setAContextType(e.target.value as AssignmentContextType)
            }
          >
            <option value="EVENT">Event</option>
            <option value="PROGRAM">Program</option>
            <option value="PROJECT">Project</option>
          </SelectField>
          <TextField
            label="Context label"
            name="aLabel"
            id="aLabel"
            value={aLabel}
            onChange={(e) => setALabel(e.target.value)}
            placeholder="e.g. Youth Retreat 2026"
          />
          <SelectField
            label="System (your scope)"
            name="aSystem"
            id="aSystem"
            value={aSystem}
            onChange={(e) => {
              setASystem(e.target.value);
              setAOrg('');
            }}
            required
          >
            <option value="">— choose system —</option>
            {assignableSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Org unit (optional)"
            name="aOrg"
            id="aOrg"
            value={aOrg}
            onChange={(e) => setAOrg(e.target.value)}
          >
            <option value="">— default for system —</option>
            {orgsForAssignment.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="End date"
            name="aEnd"
            id="aEnd"
            type="date"
            value={aEnd}
            onChange={(e) => setAEnd(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!canCreateAssignment}>
            Create assignment
          </button>
        </form>
      </Drawer>
    </div>
  );
}

function SimpleMembershipTable({
  rows,
}: {
  rows: ReturnType<typeof participationService.activeMemberships>;
}) {
  if (rows.length === 0) {
    return <EmptyState title="No active memberships" />;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Label</th>
          <th>Org unit</th>
          <th>System</th>
          <th>Since</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td>{membershipTypeLabel(m.type)}</td>
            <td>{m.label}</td>
            <td>
              {m.orgUnitId
                ? (orgService.getById(m.orgUnitId)?.name ?? m.orgUnitId)
                : '—'}
            </td>
            <td>
              {m.systemId
                ? (systemsService.getById(m.systemId)?.shortName ?? m.systemId)
                : '—'}
            </td>
            <td>{m.startDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SimplePositionTable({
  rows,
}: {
  rows: ReturnType<typeof participationService.activePositions>;
}) {
  if (rows.length === 0) {
    return <EmptyState title="No active positions" />;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Org unit</th>
          <th>System role</th>
          <th>Access</th>
          <th>Since</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>{p.title}</td>
            <td>{orgService.getById(p.orgUnitId)?.name ?? p.orgUnitId}</td>
            <td>{p.systemRole ? roleLabel(p.systemRole) : '—'}</td>
            <td>
              {p.grantsAllSystems
                ? 'All systems'
                : p.systemId
                  ? (systemsService.getById(p.systemId)?.shortName ??
                    p.systemId)
                  : '—'}
            </td>
            <td>{p.startDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
