import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Drawer } from '../../components/ui/Drawer';
import { PageHead } from '../../components/ui/FilterBar';
import { EmptyState, StatusPill } from '../../components/ui/StatusPill';
import { eventTypeLabel } from '../../domain/permissions';
import type {
  ChurchEventType,
  EventRegistrationMode,
  MissionVisibility,
  ProgramType,
  SystemId,
} from '../../domain/types';
import {
  useEventsList,
  useProgramsList,
  useProjectsList,
  useTasksList,
} from '../../hooks/useMissionLists';
import {
  missionService,
  peopleService,
  systemsService,
} from '../../services';

const EVENT_TYPES: ChurchEventType[] = [
  'CONFERENCE',
  'BAPTISM',
  'WEDDING',
  'CONCERT',
  'RETREAT',
  'SEMINAR',
  'SPECIAL_SERVICE',
  'CAMPAIGN',
  'OTHER',
];

function canCreateMissionItem(
  can: (
    resource: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT',
    action: 'MANAGE',
    systemId?: SystemId,
  ) => boolean,
  positions: Parameters<typeof missionService.canManageBoard>[0],
  systemId: SystemId,
  resource: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT',
): boolean {
  return (
    missionService.canManageBoard(positions, systemId) &&
    can(resource, 'MANAGE', systemId)
  );
}

/**
 * Peer-local Programs / Events / Tasks lists.
 * Detail opens under the same ministry basePath so session stays on the peer system.
 * Prefer API lists when VITE_API_URL is up; otherwise seed.
 * Create is available only to ministry leaders with MANAGE on that resource.
 */
export function PeerProgramsPage({
  systemId,
  basePath,
}: {
  systemId: SystemId;
  basePath: string;
}) {
  const { account, positions, can, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { programs, loading, source, reload } = useProgramsList({
    ownerSystemId: systemId,
    viewerSystemId: systemId,
  });
  const canManage = canCreateMissionItem(can, positions, systemId, 'PROGRAM');
  const ownerName = systemsService.getById(systemId)?.shortName ?? systemId;

  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [ptype, setPtype] = useState<ProgramType>('DISCIPLESHIP');
  const [vis, setVis] = useState<MissionVisibility>('MINISTRY_PRIVATE');
  const [hint, setHint] = useState('');
  const [cohort, setCohort] = useState('');

  if (!can('PROGRAM', 'VIEW', systemId)) {
    return (
      <div className="panel">
        <h2>Programs</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !account || !name.trim()) return;
    const p = missionService.createProgram({
      name: name.trim(),
      description: desc || name.trim(),
      ownerSystemId: systemId,
      visibility: vis,
      programType: ptype,
      scheduleHint: hint || undefined,
      cohortLabel: cohort || undefined,
      createdByPersonId: account.personId,
      startActive: false,
    });
    setMsg(`Draft created: ${p.name} — submit for Church Leader approval`);
    setName('');
    setDesc('');
    setHint('');
    setCohort('');
    setVis('MINISTRY_PRIVATE');
    setCreateOpen(false);
    reload();
    refreshSession();
    navigate(`${basePath}/programs/${p.id}`);
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Programs"
          subtitle={`Owned by ${ownerName}. Audience pool and eligibility filter who can discover each program.${
            source === 'api' ? ' · live API' : ''
          }`}
          actions={
            <>
              <Link className="btn secondary" to={`${basePath}/mission`}>
                Mission board
              </Link>
              {canManage && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create program
                </button>
              )}
            </>
          }
        />
      </div>

      {msg && <p className="badge">{msg}</p>}

      <Drawer
        open={createOpen}
        title="Create program"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="stack" onSubmit={onCreate}>
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={ptype}
              onChange={(e) => setPtype(e.target.value as ProgramType)}
            >
              <option value="CLASS">Class</option>
              <option value="SMALL_GROUP">Small group</option>
              <option value="FELLOWSHIP">Fellowship</option>
              <option value="DISCIPLESHIP">Discipleship</option>
              <option value="SERVING_TEAM">Serving team</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Visibility</label>
            <select
              value={vis}
              onChange={(e) => setVis(e.target.value as MissionVisibility)}
            >
              <option value="MINISTRY_PRIVATE">Ministry private</option>
              <option value="CHURCH">General church</option>
              <option value="SELECTIVE">Selective</option>
            </select>
          </div>
          <div className="field">
            <label>Cohort label</label>
            <input
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              placeholder="2026 Term"
            />
          </div>
          <div className="field">
            <label>Schedule hint</label>
            <input value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Who it is for and what happens"
            />
          </div>
          <button type="submit" className="btn">
            Create draft
          </button>
        </form>
      </Drawer>

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : programs.length === 0 ? (
          <EmptyState
            title="No discoverable programs"
            detail="Create a draft program, or open the mission board."
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create program
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Visibility</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.eligibility && (
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        Eligibility set
                      </div>
                    )}
                  </td>
                  <td>{p.programType ?? '—'}</td>
                  <td>
                    <StatusPill status={p.status}>{p.status}</StatusPill>
                  </td>
                  <td>{p.visibility}</td>
                  <td>
                    <Link to={`${basePath}/programs/${p.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function PeerEventsPage({
  systemId,
  basePath,
}: {
  systemId: SystemId;
  basePath: string;
}) {
  const { account, positions, can, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { events: ownedApi, loading, source, reload } = useEventsList({
    ownerSystemId: systemId,
  });
  const canManage = canCreateMissionItem(can, positions, systemId, 'EVENT');

  const viewOpts = {
    personId: account?.personId,
    positions,
    canEnterOwner: true,
  };
  const events =
    source === 'api'
      ? ownedApi
      : [
          ...missionService.listEvents({
            ownerSystemId: systemId,
            viewerSystemId: systemId,
            viewOpts,
          }),
          ...missionService
            .listEvents({ viewerSystemId: systemId, viewOpts })
            .filter(
              (e) =>
                e.ownerSystemId !== systemId &&
                e.collaboratorSystemIds?.includes(systemId),
            ),
        ];

  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [etype, setEtype] = useState<ChurchEventType>('OTHER');
  const [vis, setVis] = useState<MissionVisibility>('MINISTRY_PRIVATE');
  const [regMode, setRegMode] =
    useState<EventRegistrationMode>('ANNOUNCEMENT_ONLY');
  const [startsAt, setStartsAt] = useState(
    () => new Date().toISOString().slice(0, 16),
  );
  const [location, setLocation] = useState('');
  const [desc, setDesc] = useState('');
  const [beyond, setBeyond] = useState(false);

  if (!can('EVENT', 'VIEW', systemId)) {
    return (
      <div className="panel">
        <h2>Events</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !account || !name.trim()) return;
    const ev = missionService.createEvent({
      name: name.trim(),
      type: etype,
      ownerSystemId: systemId,
      startsAt: new Date(startsAt).toISOString(),
      location: location || undefined,
      description: desc || undefined,
      visibility: vis,
      registrationMode: regMode,
      beyondOwnerScope: beyond,
      createdByPersonId: account.personId,
    });
    setMsg(
      beyond
        ? `Created ${ev.name} — pending upper approvals`
        : `Created ${ev.name}`,
    );
    setName('');
    setDesc('');
    setLocation('');
    setBeyond(false);
    setVis('MINISTRY_PRIVATE');
    setCreateOpen(false);
    reload();
    refreshSession();
    navigate(`${basePath}/events/${ev.id}`);
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Events"
          subtitle={`Owned by this system or where this system is a collaborator.${
            source === 'api' ? ' · live API' : ''
          }`}
          actions={
            <>
              <Link className="btn secondary" to={`${basePath}/mission`}>
                Mission board
              </Link>
              {canManage && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create event
                </button>
              )}
            </>
          }
        />
      </div>

      {msg && <p className="badge">{msg}</p>}

      <Drawer
        open={createOpen}
        title="Create event"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="stack" onSubmit={onCreate}>
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={etype}
              onChange={(e) => setEtype(e.target.value as ChurchEventType)}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {eventTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Starts</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Visibility</label>
            <select
              value={vis}
              onChange={(e) => setVis(e.target.value as MissionVisibility)}
            >
              <option value="MINISTRY_PRIVATE">Ministry private</option>
              <option value="CHURCH">General church</option>
              <option value="SELECTIVE">Selective</option>
            </select>
          </div>
          <div className="field">
            <label>Registration</label>
            <select
              value={regMode}
              onChange={(e) =>
                setRegMode(e.target.value as EventRegistrationMode)
              }
            >
              <option value="ANNOUNCEMENT_ONLY">Announcement only</option>
              <option value="REGISTRATION_REQUIRED">
                Registration required
              </option>
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="What this event is for"
            />
          </div>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={beyond}
              onChange={(e) => setBeyond(e.target.checked)}
            />
            Beyond owner scope (needs upper approvals)
          </label>
          <button type="submit" className="btn">
            Create event
          </button>
        </form>
      </Drawer>

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No events"
            detail="Create an event for this ministry, or open the mission board."
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create event
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>When</th>
                <th>Phase</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    {e.ownerSystemId !== systemId && (
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        Collab ·{' '}
                        {systemsService.getById(e.ownerSystemId)?.shortName}
                      </div>
                    )}
                  </td>
                  <td>{eventTypeLabel(e.type)}</td>
                  <td>{new Date(e.startsAt).toLocaleString()}</td>
                  <td>{e.lifecyclePhase ?? 'PREPARE'}</td>
                  <td>
                    <StatusPill status={e.status}>{e.status}</StatusPill>
                  </td>
                  <td>
                    <Link to={`${basePath}/events/${e.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function PeerTasksPage({
  systemId,
  basePath,
}: {
  systemId: SystemId;
  basePath: string;
}) {
  const { account, positions, can, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { tasks, loading, source, reload } = useTasksList({ systemId });
  const canManage = canCreateMissionItem(can, positions, systemId, 'TASK');
  const people = peopleService.list();

  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [ownerId, setOwnerId] = useState(account?.personId ?? '');
  const [dueDate, setDueDate] = useState('');
  const [vis, setVis] = useState<MissionVisibility>('MINISTRY_PRIVATE');
  const [grantAccess, setGrantAccess] = useState(false);

  if (!can('TASK', 'VIEW', systemId)) {
    return (
      <div className="panel">
        <h2>Tasks</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !account || !title.trim() || !ownerId) return;
    const t = missionService.createTask({
      title: title.trim(),
      description: desc || undefined,
      ownerPersonId: ownerId,
      createdByPersonId: account.personId,
      systemId,
      visibility: vis,
      dueDate: dueDate || undefined,
      grantsSystemAccess: grantAccess,
    });
    setMsg(
      grantAccess
        ? `Created ${t.title} — temp system access while active`
        : `Created ${t.title}`,
    );
    setTitle('');
    setDesc('');
    setDueDate('');
    setGrantAccess(false);
    setVis('MINISTRY_PRIVATE');
    setCreateOpen(false);
    reload();
    refreshSession();
    navigate(`${basePath}/tasks/${t.id}`);
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Tasks"
          subtitle={`Work items owned by this system.${
            source === 'api' ? ' · live API' : ''
          }`}
          actions={
            <>
              <Link className="btn secondary" to={`${basePath}/mission`}>
                Mission board
              </Link>
              {canManage && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create task
                </button>
              )}
            </>
          }
        />
      </div>

      {msg && <p className="badge">{msg}</p>}

      <Drawer
        open={createOpen}
        title="Create task"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="stack" onSubmit={onCreate}>
          <div className="field">
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Owner</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              required
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ?? p.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Visibility</label>
            <select
              value={vis}
              onChange={(e) => setVis(e.target.value as MissionVisibility)}
            >
              <option value="MINISTRY_PRIVATE">Ministry private</option>
              <option value="CHURCH">General church</option>
              <option value="SELECTIVE">Selective</option>
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Definition of done, links, notes"
            />
          </div>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={grantAccess}
              onChange={(e) => setGrantAccess(e.target.checked)}
            />
            Temp system access while task is active
          </label>
          <button type="submit" className="btn">
            Create task
          </button>
        </form>
      </Drawer>

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks"
            detail="Create a task for this ministry, or open the mission board."
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create task
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                  </td>
                  <td>
                    <StatusPill status={t.status}>{t.status}</StatusPill>
                  </td>
                  <td>{t.dueDate ?? '—'}</td>
                  <td>
                    <Link to={`${basePath}/tasks/${t.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function PeerProjectsPage({
  systemId,
  basePath,
}: {
  systemId: SystemId;
  basePath: string;
}) {
  const { account, positions, can, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { projects, loading, source, reload } = useProjectsList({
    ownerSystemId: systemId,
  });
  const canManage = canCreateMissionItem(can, positions, systemId, 'PROJECT');
  const ownerName = systemsService.getById(systemId)?.shortName ?? systemId;
  const programs = missionService
    .listPrograms({
      ownerSystemId: systemId,
      viewerSystemId: systemId,
      viewOpts: {
        personId: account?.personId,
        positions,
        canEnterOwner: true,
      },
    })
    .filter((p) => p.status === 'ACTIVE' || p.status === 'SETUP');

  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<MissionVisibility>('MINISTRY_PRIVATE');
  const [beyond, setBeyond] = useState(false);
  const [programId, setProgramId] = useState('');

  if (!can('PROJECT', 'VIEW', systemId)) {
    return (
      <div className="panel">
        <h2>Projects</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !account || !name.trim()) return;
    const r = missionService.createProject({
      name: name.trim(),
      description: desc || undefined,
      ownerSystemId: systemId,
      visibility: vis,
      beyondOwnerScope: beyond,
      programId: programId || undefined,
      createdByPersonId: account.personId,
      startActive: false,
    });
    if (!r.ok || !r.project) {
      setMsg(r.reason ?? 'Create failed');
      return;
    }
    setMsg(`Draft project: ${r.project.name} — submit when ready`);
    setName('');
    setDesc('');
    setBeyond(false);
    setProgramId('');
    setVis('MINISTRY_PRIVATE');
    setCreateOpen(false);
    reload();
    refreshSession();
    navigate(`${basePath}/projects/${r.project.id}`);
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Projects"
          subtitle={`Owned by ${ownerName}. Delivery + stewardship spine for defined outcomes.${
            source === 'api' ? ' · live API' : ''
          }`}
          actions={
            <>
              <Link className="btn secondary" to={`${basePath}/mission`}>
                Mission board
              </Link>
              {canManage && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create project
                </button>
              )}
            </>
          }
        />
      </div>

      {msg && <p className="badge">{msg}</p>}

      <Drawer
        open={createOpen}
        title="Create project"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="stack" onSubmit={onCreate}>
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Visibility</label>
            <select
              value={vis}
              onChange={(e) => setVis(e.target.value as MissionVisibility)}
            >
              <option value="MINISTRY_PRIVATE">Ministry private</option>
              <option value="CHURCH">General church</option>
              <option value="SELECTIVE">Selective</option>
            </select>
          </div>
          <div className="field">
            <label>Parent programme (optional)</label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">— None —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Outcome and scope in a few lines"
            />
          </div>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={beyond}
              onChange={(e) => setBeyond(e.target.checked)}
            />
            Beyond owner scope (needs upper approvals)
          </label>
          <button type="submit" className="btn">
            Create draft
          </button>
        </form>
      </Drawer>

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects"
            detail="Create a draft project for this ministry, or open the mission board."
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Create project
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Visibility</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <StatusPill status={p.status}>{p.status}</StatusPill>
                  </td>
                  <td>{p.visibility}</td>
                  <td>
                    <Link to={`${basePath}/projects/${p.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

