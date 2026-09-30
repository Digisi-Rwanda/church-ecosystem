import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  MissionCreateDrawer,
  type MissionCreateKind,
} from '../../components/MissionCreateDrawer';
import { Drawer } from '../../components/ui/Drawer';
import {
  SelectField,
} from '../../components/ui/Field';
import { FilterBar, PageHead } from '../../components/ui/FilterBar';
import {
  EmptyState,
  ForbiddenState,
  StatusPill,
} from '../../components/ui/StatusPill';
import { eventTypeLabel } from '../../domain/permissions';
import type {
  SystemId,
  WorkTask,
} from '../../domain/types';
import {
  isChurchLeader,
  missionService,
  peopleService,
  systemsService,
} from '../../services';

type Tab = 'board' | 'shares';
type KindFilter = 'all' | 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT';

/**
 * Shared dual-lane mission board for any peer system (and Main).
 * Default create = MINISTRY_PRIVATE; SELECTIVE shares; leaders publish to CHURCH.
 */
type MissionBuckets<T> = {
  church: T[];
  own: T[];
  selective: T[];
};

function filterBuckets<T extends { orgUnitId?: string }>(
  buckets: MissionBuckets<T>,
  orgUnitId?: string,
): MissionBuckets<T> {
  if (!orgUnitId) return buckets;
  const keep = (rows: T[]) =>
    rows.filter((r) => r.orgUnitId === orgUnitId);
  return {
    church: keep(buckets.church),
    own: keep(buckets.own),
    selective: keep(buckets.selective),
  };
}

function taskOrgUnitId(task: WorkTask): string | undefined {
  if (task.contextType === 'EVENT' && task.contextId) {
    return missionService.getEvent(task.contextId)?.orgUnitId;
  }
  if (task.contextType === 'PROGRAM' && task.contextId) {
    return missionService.getProgram(task.contextId)?.orgUnitId;
  }
  if (task.contextType === 'PROJECT' && task.contextId) {
    return missionService.getProject(task.contextId)?.orgUnitId;
  }
  return undefined;
}

function filterTaskBuckets(
  buckets: MissionBuckets<WorkTask>,
  orgUnitId?: string,
): MissionBuckets<WorkTask> {
  if (!orgUnitId) return buckets;
  const keep = (rows: WorkTask[]) =>
    rows.filter((t) => taskOrgUnitId(t) === orgUnitId);
  return {
    church: keep(buckets.church),
    own: keep(buckets.own),
    selective: keep(buckets.selective),
  };
}

export function MinistryMissionBoard({
  systemId,
  title,
  orgUnitId,
}: {
  systemId: SystemId;
  title?: string;
  orgUnitId?: string;
}) {
  const { account, positions, authorize, can, roles } = useAuth();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [tab, setTab] = useState<Tab>('board');
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const churchLead = isChurchLeader(roles);
  const basePath =
    systemsService.getById(systemId)?.basePath ??
    (systemId === 'sys-main' ? '' : `/systems/${systemId.replace(/^sys-/, '')}`);

  const viewOpts = useMemo(
    () => ({
      personId: account?.personId,
      positions,
      canEnterOwner: true,
    }),
    [account?.personId, positions],
  );

  const isLeader = missionService.canManageBoard(positions, systemId);
  const canView =
    can('PROGRAM', 'VIEW', systemId) ||
    can('EVENT', 'VIEW', systemId) ||
    can('TASK', 'VIEW', systemId) ||
    can('PROJECT', 'VIEW', systemId);

  const programs = filterBuckets(
    missionService.programsForSystem(systemId, viewOpts),
    orgUnitId,
  );
  const events = filterBuckets(
    missionService.eventsForSystem(systemId, viewOpts),
    orgUnitId,
  );
  const tasks = filterTaskBuckets(
    missionService.tasksForSystem(systemId, viewOpts),
    orgUnitId,
  );
  const projects = filterBuckets(
    missionService.projectsForSystem(systemId, viewOpts),
    orgUnitId,
  );

  const totalCount =
    programs.church.length +
    programs.own.length +
    programs.selective.length +
    events.church.length +
    events.own.length +
    events.selective.length +
    tasks.church.length +
    tasks.own.length +
    tasks.selective.length +
    projects.church.length +
    projects.own.length +
    projects.selective.length;

  const [kind, setKind] = useState<MissionCreateKind>('PROGRAM');

const [shareKind, setShareKind] = useState<
    'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT'
  >('PROGRAM');
  const [shareResourceId, setShareResourceId] = useState('');
  const [sharePersonId, setSharePersonId] = useState('');
  const [shareAction, setShareAction] = useState<'VIEW' | 'MANAGE'>('VIEW');

  const selectableResources = useMemo(() => {
    const asOpts = (rows: Array<{ id: string; name: string }>) => rows;
    if (shareKind === 'PROGRAM') {
      return asOpts(
        missionService
          .listPrograms({ viewerSystemId: systemId, viewOpts })
          .filter((p) => p.ownerSystemId === systemId)
          .map((p) => ({ id: p.id, name: p.name })),
      );
    }
    if (shareKind === 'EVENT') {
      return asOpts(
        missionService
          .listEvents({ viewerSystemId: systemId, viewOpts })
          .filter((e) => e.ownerSystemId === systemId)
          .map((e) => ({ id: e.id, name: e.name })),
      );
    }
    if (shareKind === 'PROJECT') {
      return asOpts(
        missionService
          .listProjects({ viewerSystemId: systemId, viewOpts })
          .filter((p) => p.ownerSystemId === systemId)
          .map((p) => ({ id: p.id, name: p.name })),
      );
    }
    return asOpts(
      missionService
        .listTasks({ viewerSystemId: systemId, viewOpts })
        .filter((t) => t.systemId === systemId)
        .map((t) => ({ id: t.id, name: t.title })),
    );
  }, [shareKind, systemId, viewOpts, programs, events, tasks, projects]);

  const activeShares = missionService
    .listShares()
    .filter((s) => s.status === 'ACTIVE');

  if (!account || !canView) {
    return (
      <div className="panel">
        <h2>{title ?? 'Mission'}</h2>
        <ForbiddenState resource="PROGRAM" detail="No mission view rights in this system." />
      </div>
    );
  }

  function gate(resource: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT'): boolean {
    if (!isLeader) {
      setMsg(
        'Only ministry leaders (President, VP, Secretary, Treasurer) may manage the mission board.',
      );
      return false;
    }
    const d = authorize(resource, 'MANAGE', systemId);
    if (!d.allowed) {
      setMsg(d.reason);
      return false;
    }
    return true;
  }

  function detailPath(createKind: MissionCreateKind, id: string) {
    const segment =
      createKind === 'PROGRAM'
        ? 'programs'
        : createKind === 'EVENT'
          ? 'events'
          : createKind === 'PROJECT'
            ? 'projects'
            : 'tasks';
    if (!basePath || basePath === '/') return `/${segment}/${id}`;
    return `${basePath.replace(/\/$/, '')}/${segment}/${id}`;
  }

  function onShare(e: FormEvent) {
    e.preventDefault();
    const resourceId = shareResourceId || selectableResources[0]?.id || '';
    if (!gate(shareKind) || !resourceId || !sharePersonId) return;
    if (shareKind === 'PROGRAM') {
      missionService.updateProgram(resourceId, { visibility: 'SELECTIVE' });
    } else if (shareKind === 'EVENT') {
      missionService.updateEvent(resourceId, { visibility: 'SELECTIVE' });
    } else if (shareKind === 'PROJECT') {
      missionService.updateProject(resourceId, { visibility: 'SELECTIVE' });
    } else {
      missionService.updateTask(resourceId, { visibility: 'SELECTIVE' });
    }
    missionService.grantShare({
      kind: shareKind,
      resourceId,
      personId: sharePersonId,
      action: shareAction,
      grantedByPersonId: account!.personId,
      reason: 'Mission board selective share',
    });
    setMsg('Share granted — item set to Selected members');
    setShareResourceId('');
    setSharePersonId('');
    setShareOpen(false);
    refresh();
  }

  function publish(
    kindP: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT',
    id: string,
  ) {
    if (!gate(kindP)) return;
    if (kindP === 'PROGRAM') missionService.publishProgram(id);
    if (kindP === 'EVENT') missionService.publishEvent(id);
    if (kindP === 'TASK') missionService.publishTask(id);
    if (kindP === 'PROJECT') missionService.publishProject(id);
    setMsg('Published to general church');
    refresh();
  }

  const systemName = systemsService.getById(systemId)?.shortName ?? systemId;
  function laneProps(bucket: 'church' | 'own' | 'selective') {
    const showP = kindFilter === 'all' || kindFilter === 'PROGRAM';
    const showE = kindFilter === 'all' || kindFilter === 'EVENT';
    const showT = kindFilter === 'all' || kindFilter === 'TASK';
    const showJ = kindFilter === 'all' || kindFilter === 'PROJECT';
    return {
      programs: showP ? programs[bucket] : [],
      events: showE ? events[bucket] : [],
      tasks: showT ? tasks[bucket] : [],
      projects: showJ ? projects[bucket] : [],
    };
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title={title ?? `${systemName} mission board`}
          subtitle="Lanes: General church · Ministry private (default) · Selected members. Leaders create, share, and publish."
          actions={
            <>
              <button
                type="button"
                className={`btn ${tab === 'board' ? '' : 'ghost'}`}
                onClick={() => setTab('board')}
              >
                Board
              </button>
              {isLeader && (
                <>
                  <button
                    type="button"
                    className={`btn ${tab === 'shares' ? '' : 'ghost'}`}
                    onClick={() => setTab('shares')}
                  >
                    Shares
                  </button>
                  <select
                    aria-label="Create type"
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as MissionCreateKind)
                    }
                    style={{ minHeight: '2.25rem' }}
                  >
                    <option value="PROGRAM">Program</option>
                    <option value="EVENT">Event</option>
                    <option value="TASK">Task</option>
                    <option value="PROJECT">Project</option>
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setCreateOpen(true)}
                  >
                    Create
                  </button>
                </>
              )}
            </>
          }
        />
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <span className="badge">{totalCount} visible items</span>
          {isLeader && <span className="badge">Mission leader</span>}
          <span className="badge">{systemName}</span>
        </div>
        {tab === 'board' && (
          <div style={{ marginTop: '0.75rem' }}>
            <FilterBar
              value={kindFilter}
              onChange={(v) => setKindFilter(v as KindFilter)}
              options={[
                { value: 'all', label: 'All', count: totalCount },
                {
                  value: 'PROGRAM',
                  label: 'Programs',
                  count:
                    programs.church.length +
                    programs.own.length +
                    programs.selective.length,
                },
                {
                  value: 'EVENT',
                  label: 'Events',
                  count:
                    events.church.length +
                    events.own.length +
                    events.selective.length,
                },
                {
                  value: 'TASK',
                  label: 'Tasks',
                  count:
                    tasks.church.length +
                    tasks.own.length +
                    tasks.selective.length,
                },
                {
                  value: 'PROJECT',
                  label: 'Projects',
                  count:
                    projects.church.length +
                    projects.own.length +
                    projects.selective.length,
                },
              ]}
            />
          </div>
        )}
        {msg && <p className="badge">{msg}</p>}
      </div>

      {tab === 'board' && (
        <div className="lane-board">
          <Lane
            title="General church"
            hint="Published / church-wide"
            variant="church"
            {...laneProps('church')}
            onClearKindFilter={
              kindFilter !== 'all' ? () => setKindFilter('all') : undefined
            }
          />
          <Lane
            title="Ministry private"
            hint={`Only ${systemName}`}
            variant="private"
            {...laneProps('own')}
            onPublish={isLeader ? publish : undefined}
            onClearKindFilter={
              kindFilter !== 'all' ? () => setKindFilter('all') : undefined
            }
          />
          <Lane
            title="Selected members"
            hint="Shared with specific people"
            variant="selective"
            {...laneProps('selective')}
            onPublish={isLeader ? publish : undefined}
            onClearKindFilter={
              kindFilter !== 'all' ? () => setKindFilter('all') : undefined
            }
          />
        </div>
      )}

      {tab === 'shares' && isLeader && (
        <div className="stack">
          <div className="panel">
            <PageHead
              title="Active shares"
              subtitle="SELECTIVE visibility with VIEW or MANAGE for a specific person."
              actions={
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShareOpen(true)}
                >
                  Grant share
                </button>
              }
            />
            {activeShares.length === 0 ? (
              <EmptyState
                title="No active shares"
                detail="Grant a share to move an item into the Selected members lane."
                action={
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShareOpen(true)}
                  >
                    Grant share
                  </button>
                }
              />
            ) : (
              <table className="table" style={{ marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Item</th>
                    <th>Person</th>
                    <th>Action</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeShares.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <StatusPill tone="info">{s.kind}</StatusPill>
                      </td>
                      <td>{s.resourceId}</td>
                      <td>
                        {peopleService.getById(s.personId)?.preferredName ??
                          s.personId}
                      </td>
                      <td>{s.action}</td>
                      <td>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            missionService.revokeShare(s.id);
                            refresh();
                          }}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {account ? (
        <MissionCreateDrawer
          kind={kind}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          listSource="seed"
          ownerSystemId={systemId}
          accountPersonId={account.personId}
          canManage={isLeader && authorize(kind, 'MANAGE', systemId).allowed}
          isChurchLeader={churchLead}
          onCreated={(r) => {
            setMsg(r.message);
            refresh();
            setTab('board');
            navigate(detailPath(r.kind, r.id));
          }}
        />
      ) : null}

      <Drawer
        open={shareOpen}
        title="Grant share"
        onClose={() => setShareOpen(false)}
        wide
      >
        <form className="stack" onSubmit={onShare}>
          <p className="muted" style={{ margin: 0 }}>
            Sets item to SELECTIVE and grants VIEW or MANAGE to one Person.
          </p>
          <SelectField
            label="Kind"
            name="sk"
            id="sk"
            value={shareKind}
            onChange={(e) => {
              const next = e.target.value as typeof shareKind;
              setShareKind(next);
              setShareResourceId('');
            }}
          >
            <option value="PROGRAM">Program</option>
            <option value="EVENT">Event</option>
            <option value="TASK">Task</option>
            <option value="PROJECT">Project</option>
          </SelectField>
          <SelectField
            label="Item"
            name="sr"
            id="sr"
            value={shareResourceId || selectableResources[0]?.id || ''}
            onChange={(e) => setShareResourceId(e.target.value)}
            required
          >
            {selectableResources.length === 0 ? (
              <option value="">No items of this kind</option>
            ) : (
              selectableResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))
            )}
          </SelectField>
          <SelectField
            label="Person"
            name="sp"
            id="sp"
            value={sharePersonId}
            onChange={(e) => setSharePersonId(e.target.value)}
            required
          >
            <option value="">— select —</option>
            {peopleService.list().map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Access"
            name="sa"
            id="sa"
            value={shareAction}
            onChange={(e) =>
              setShareAction(e.target.value as 'VIEW' | 'MANAGE')
            }
          >
            <option value="VIEW">View</option>
            <option value="MANAGE">Manage</option>
          </SelectField>
          <button type="submit" className="btn">
            Grant share
          </button>
        </form>
      </Drawer>
    </div>
  );
}

function Lane({
  title,
  hint,
  variant,
  programs,
  events,
  tasks,
  projects,
  onPublish,
  onClearKindFilter,
}: {
  title: string;
  hint: string;
  variant: 'church' | 'private' | 'selective';
  programs: { id: string; name: string; ownerSystemId: SystemId }[];
  events: { id: string; name: string; type: string; startsAt: string }[];
  tasks: { id: string; title: string }[];
  projects: { id: string; name: string }[];
  onPublish?: (
    kind: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT',
    id: string,
  ) => void;
  onClearKindFilter?: () => void;
}) {
  const count =
    programs.length + events.length + tasks.length + projects.length;
  return (
    <div className={`lane lane-${variant}`}>
      <div className="lane-head">
        <div>
          <h3>{title}</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
            {hint}
          </p>
        </div>
        <span className="badge">{count}</span>
      </div>
      <LaneList
        programs={programs}
        events={events}
        tasks={tasks}
        projects={projects}
        onPublish={onPublish}
        onClearKindFilter={onClearKindFilter}
      />
    </div>
  );
}

function MissionCard({
  kind,
  title,
  meta,
  href,
  onPublish,
}: {
  kind: string;
  title: string;
  meta?: string;
  href?: string;
  onPublish?: () => void;
}) {
  return (
    <div className="mission-card">
      <div className="kind">
        <StatusPill
          tone={
            kind === 'Program'
              ? 'success'
              : kind === 'Event'
                ? 'info'
                : kind === 'Project'
                  ? 'warn'
                  : 'neutral'
          }
        >
          {kind}
        </StatusPill>
      </div>
      <strong>
        {href ? (
          <Link to={href} style={{ color: 'inherit' }}>
            {title}
          </Link>
        ) : (
          title
        )}
      </strong>
      {meta && <div className="meta">{meta}</div>}
      {onPublish && (
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: '0.35rem', padding: '0.25rem 0.5rem' }}
          onClick={onPublish}
        >
          Publish to church
        </button>
      )}
    </div>
  );
}

function LaneList({
  programs,
  events,
  tasks,
  projects,
  onPublish,
  onClearKindFilter,
}: {
  programs: { id: string; name: string; ownerSystemId?: SystemId }[];
  events: { id: string; name: string; type?: string; startsAt?: string }[];
  tasks: { id: string; title: string }[];
  projects: { id: string; name: string }[];
  onPublish?: (
    kind: 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT',
    id: string,
  ) => void;
  onClearKindFilter?: () => void;
}) {
  const empty =
    programs.length + events.length + tasks.length + projects.length === 0;
  if (empty) {
    return (
      <EmptyState
        title="Nothing in this lane"
        detail="Create an item or change the kind filter."
        action={
          onClearKindFilter ? (
            <button
              type="button"
              className="btn secondary"
              onClick={onClearKindFilter}
            >
              Show all kinds
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      {programs.map((p) => (
        <MissionCard
          key={p.id}
          kind="Program"
          title={p.name}
          href={`/programs/${p.id}`}
          meta={
            p.ownerSystemId
              ? systemsService.getById(p.ownerSystemId)?.shortName
              : undefined
          }
          onPublish={onPublish ? () => onPublish('PROGRAM', p.id) : undefined}
        />
      ))}
      {events.map((e) => (
        <MissionCard
          key={e.id}
          kind="Event"
          title={e.name}
          href={`/events/${e.id}`}
          meta={[
            e.type ? eventTypeLabel(e.type as never) : null,
            e.startsAt ? new Date(e.startsAt).toLocaleDateString() : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPublish={onPublish ? () => onPublish('EVENT', e.id) : undefined}
        />
      ))}
      {tasks.map((t) => (
        <MissionCard
          key={t.id}
          kind="Task"
          title={t.title}
          href={`/tasks/${t.id}`}
          onPublish={onPublish ? () => onPublish('TASK', t.id) : undefined}
        />
      ))}
      {projects.map((p) => (
        <MissionCard
          key={p.id}
          kind="Project"
          title={p.name}
          href={`/projects/${p.id}`}
          onPublish={onPublish ? () => onPublish('PROJECT', p.id) : undefined}
        />
      ))}
    </div>
  );
}
