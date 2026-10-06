import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MissionCreateDrawer } from '../components/MissionCreateDrawer';
import {
  WorkItemViews,
  WorkViewToggle,
  type WorkViewMode,
} from '../components/WorkItemViews';
import { FilterBar, PageHead } from '../components/ui/FilterBar';
import {
  EmptyState,
  ForbiddenState,
  StatusPill,
} from '../components/ui/StatusPill';
import { projectToWorkItem } from '../domain/workItem';
import { useProjectsList } from '../hooks/useMissionLists';
import {
  isChurchLeader,
  missionService,
  peopleService,
  systemsService,
} from '../services';

export function ProjectsPage() {
  const { can, account, roles, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { projects, reload, source } = useProjectsList();
  const refresh = () => {
    reload();
    refreshSession();
  };
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<WorkViewMode>('list');
  const canView = can('PROJECT', 'VIEW');
  const canManage = can('PROJECT', 'MANAGE');
  const churchLead = isChurchLeader(roles);

  const pending = projects.filter((p) => p.status === 'PENDING_APPROVAL');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return projects;
    if (statusFilter === 'pending') {
      return projects.filter((p) => p.status === 'PENDING_APPROVAL');
    }
    if (statusFilter === 'draft') {
      return projects.filter((p) => p.status === 'DRAFT');
    }
    if (statusFilter === 'setup') {
      return projects.filter((p) => p.status === 'PLANNED');
    }
    if (statusFilter === 'paused') {
      return projects.filter((p) => p.status === 'PAUSED');
    }
    if (statusFilter === 'closing') {
      return projects.filter((p) => p.status === 'CLOSING');
    }
    if (statusFilter === 'active') {
      return projects.filter((p) => p.status === 'ACTIVE');
    }
    if (statusFilter === 'done') {
      return projects.filter(
        (p) => p.status === 'DONE' || p.status === 'CANCELLED',
      );
    }
    return projects;
  }, [projects, statusFilter]);

  if (!account || !canView) {
    return (
      <div className="panel">
        <h2>Projects</h2>
        <ForbiddenState resource="PROJECT" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          actions={
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
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <span className="badge">{projects.length} visible</span>
          <span className="badge">{pending.length} pending</span>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            <FilterBar
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All', count: projects.length },
                {
                  value: 'draft',
                  label: 'Draft',
                  count: projects.filter((p) => p.status === 'DRAFT').length,
                },
                { value: 'pending', label: 'Pending', count: pending.length },
                {
                  value: 'setup',
                  label: 'Setup',
                  count: projects.filter((p) => p.status === 'PLANNED').length,
                },
                {
                  value: 'paused',
                  label: 'Paused',
                  count: projects.filter((p) => p.status === 'PAUSED').length,
                },
                {
                  value: 'closing',
                  label: 'Closing',
                  count: projects.filter((p) => p.status === 'CLOSING').length,
                },
                {
                  value: 'active',
                  label: 'Active',
                  count: projects.filter((p) => p.status === 'ACTIVE').length,
                },
                {
                  value: 'done',
                  label: 'Closed',
                  count: projects.filter(
                    (p) => p.status === 'DONE' || p.status === 'CANCELLED',
                  ).length,
                },
              ]}
            />
            <WorkViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </div>

      {msg && <p className="badge">{msg}</p>}

      {pending.length > 0 && statusFilter === 'all' && (
        <div className="panel">
          <h3>Pending approval</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {pending.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
                <span className="muted">
                  {' '}
                  · missing{' '}
                  {missionService
                    .missingProjectApprovals(p.id)
                    .map((l) => l.label)
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        {view !== 'list' ? (
          <WorkItemViews
            items={filtered.map((p) => projectToWorkItem(p))}
            view={view}
            emptyTitle="No projects match"
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No projects match"
            detail={
              statusFilter === 'all'
                ? 'Start an initiative from the create drawer.'
                : 'Try another filter.'
            }
            action={
              canManage && statusFilter === 'all' ? (
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
                <th>Project</th>
                <th>Lead</th>
                <th>Collaborators</th>
                <th>Scope</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>
                      <strong>{p.name}</strong>
                    </Link>
                    <div className="muted">
                      {systemsService.getById(p.ownerSystemId)?.shortName}
                    </div>
                  </td>
                  <td>
                    {p.leadPersonId
                      ? (peopleService.getById(p.leadPersonId)?.preferredName ??
                        p.leadPersonId)
                      : '—'}
                  </td>
                  <td>
                    {(p.collaboratorSystemIds ?? [])
                      .map(
                        (id) => systemsService.getById(id)?.shortName ?? id,
                      )
                      .join(', ') || '—'}
                  </td>
                  <td>{p.beyondOwnerScope ? 'Beyond' : 'In-scope'}</td>
                  <td>
                    <StatusPill status={p.status}>{p.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {account && (
        <MissionCreateDrawer
          kind="PROJECT"
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          listSource={source}
          accountPersonId={account.personId}
          canManage={canManage}
          isChurchLeader={churchLead}
          onCreated={(r) => {
            setMsg(r.message);
            refresh();
            navigate(`/projects/${r.id}`);
          }}
        />
      )}
    </div>
  );
}
