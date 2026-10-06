import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/ui/Icon';
import { StatusPill } from '../components/ui/StatusPill';
import { ListSkeleton } from '../components/ui/Skeleton';
import { SystemLauncher } from '../components/SystemLauncher';
import { useAuth } from '../auth/AuthContext';
import { useAttention } from '../hooks/useAttention';
import { useT } from '../i18n/I18nContext';
import { statusLabel } from '../domain/statusCopy';
import type { SystemRole } from '../domain/types';
import {
  missionService,
  peopleService,
  systemsService,
} from '../services';

type HomePersona =
  | 'leader'
  | 'secretary'
  | 'treasurer'
  | 'member';

type TaskTab = 'all' | 'todo' | 'progress' | 'done';

function resolvePersona(roles: SystemRole[]): HomePersona {
  if (roles.includes('CHURCH_LEADER')) return 'leader';
  if (roles.includes('CATECHIST')) return 'leader';
  if (roles.includes('PASTOR')) return 'leader';
  if (roles.includes('CHURCH_SECRETARY')) return 'secretary';
  if (roles.includes('CHURCH_TREASURER')) return 'treasurer';
  return 'member';
}

function calHref(item: { kind: string; id: string; programId?: string }) {
  if (item.kind === 'EVENT') return `/events/${item.id}`;
  if (item.programId) return `/programs/${item.programId}`;
  return '/programs';
}

function isDoneStatus(status: string) {
  return (
    status === 'DONE' ||
    status === 'COMPLETED' ||
    status === 'ENDED' ||
    status === 'CANCELLED'
  );
}

function isProgressStatus(status: string) {
  return (
    status === 'IN_PROGRESS' ||
    status === 'ACTIVE' ||
    status === 'SETUP' ||
    status === 'CLOSING' ||
    status === 'PENDING_APPROVAL'
  );
}

function kindLabel(kind: string) {
  if (kind === 'EVENT') return 'Event';
  if (kind === 'ACTIVITY') return 'Activity';
  if (kind === 'PROGRAM') return 'Program';
  return kind.replace(/_/g, ' ').toLowerCase();
}

function CardTitle({
  icon,
  tone = 'accent',
  children,
}: {
  icon: IconName;
  tone?: 'accent' | 'success' | 'coral' | 'sky' | 'yellow';
  children: ReactNode;
}) {
  return (
    <h3 className="dash-card-title">
      <span className={`dash-card-icon tone-${tone}`} aria-hidden>
        <Icon name={icon} size={15} />
      </span>
      {children}
    </h3>
  );
}

export function DashboardPage() {
  const t = useT();
  const {
    personName,
    account,
    roles,
    roleLabels,
    positions,
    availableSystems,
    canManagePeople,
  } = useAuth();

  const {
    items: attentionItems,
    loading: attentionLoading,
    unreadCount,
  } = useAttention();

  const [taskTab, setTaskTab] = useState<TaskTab>('all');
  const persona = resolvePersona(roles);
  const viewOpts = {
    personId: account?.personId,
    positions,
    canEnterOwner: true,
  };

  const projects = useMemo(
    () => missionService.listProjects({ viewerSystemId: 'sys-main', viewOpts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.personId, positions, roles],
  );
  const programs = useMemo(
    () => missionService.listPrograms({ viewerSystemId: 'sys-main', viewOpts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.personId, positions, roles],
  );
  const events = useMemo(
    () => missionService.listEvents({ viewerSystemId: 'sys-main', viewOpts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.personId, positions, roles],
  );
  const tasks = useMemo(
    () => missionService.listTasks({ viewerSystemId: 'sys-main', viewOpts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.personId, positions, roles],
  );
  const calendarItems = useMemo(
    () => missionService.calendar('sys-main', viewOpts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.personId, positions, roles],
  );

  const myTasks = useMemo(() => {
    if (!account) return tasks.slice(0, 8);
    return tasks
      .filter(
        (t) =>
          t.ownerPersonId === account.personId ||
          (t.helperPersonIds ?? []).includes(account.personId),
      )
      .slice(0, 12);
  }, [tasks, account]);

  const filteredTasks = useMemo(() => {
    if (taskTab === 'todo')
      return myTasks.filter(
        (t) => t.status === 'TODO' || (t.status as string) === 'OPEN',
      );
    if (taskTab === 'progress')
      return myTasks.filter((t) => isProgressStatus(t.status));
    if (taskTab === 'done') return myTasks.filter((t) => isDoneStatus(t.status));
    return myTasks;
  }, [myTasks, taskTab]);

  const thisWeek = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return calendarItems
      .filter((c) => {
        const d = new Date(c.startsAt);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      })
      .slice(0, 8);
  }, [calendarItems]);

  const upcomingEvents = events
    .filter((e) => e.status !== 'CANCELLED' && (e.status as string) !== 'ENDED')
    .slice(0, 5);

  const openProjects = projects
    .filter((p) => !isDoneStatus(p.status))
    .slice(0, 5);

  const peerSystems = availableSystems
    .filter((s) => s.id !== 'sys-main')
    .slice(0, 6);

  const peopleCount = peopleService.list().length;
  const firstName = personName.split(' ')[0] || personName;
  const needsYou = attentionItems.slice(0, 6);

  const primaryCta =
    persona === 'secretary' && canManagePeople ? (
      <Link to="/people/new" className="btn">
        Add person
      </Link>
    ) : persona === 'leader' ? (
      <Link to="/inbox" className="btn">
        Review inbox
      </Link>
    ) : (
      <Link to="/tasks" className="btn">
        My tasks
      </Link>
    );

  return (
    <div className="dash-board dash-board-home">
      <header className="dash-home-welcome">
        <div>
          <p className="dash-home-greeting">
            {t('home.goodDay')} <strong>{firstName}</strong>
            <span className="muted">
              {' '}
              · {roleLabels[0] ?? 'Member'}
              {unreadCount > 0 ? ` · ${t('home.waitingInbox', { count: unreadCount })}` : ''}
            </span>
          </p>
        </div>
        <div className="row">
          <Link to="/inbox" className="btn secondary">
            {t('shell.inbox')}{unreadCount > 0 ? ` · ${unreadCount}` : ''}
          </Link>
          {primaryCta}
        </div>
      </header>

      <div className="dash-home-grid">
        {/* 1 · Urgent */}
        <section className="dash-card dash-home-span">
          <div className="dash-card-head">
            <CardTitle icon="inbox" tone="coral">
              {t('home.urgent')}
            </CardTitle>
            <Link to="/inbox" className="muted">
              {t('home.inboxLink')}
            </Link>
          </div>
          {attentionLoading ? (
            <ListSkeleton rows={3} />
          ) : needsYou.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t('home.urgentEmpty')}
            </p>
          ) : (
            <ul className="dash-deadline-list">
              {needsYou.map((item) => (
                <li key={item.id}>
                  <div>
                    <Link to={item.href || '/inbox'}>
                      <strong>{item.title}</strong>
                    </Link>
                    {item.reason ? (
                      <div className="muted" style={{ fontSize: '0.78rem' }}>
                        {item.reason}
                      </div>
                    ) : null}
                  </div>
                  {item.unread ? (
                    <StatusPill tone="warn">{t('home.statusNew')}</StatusPill>
                  ) : (
                    <span className="muted" style={{ fontSize: '0.75rem' }}>
                      {t('home.statusOpen')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2 · This week */}
        <section className="dash-card">
          <div className="dash-card-head">
            <CardTitle icon="calendar" tone="accent">
              This week
            </CardTitle>
            <Link to="/calendar" className="muted">
              Calendar →
            </Link>
          </div>
          {thisWeek.length === 0 && upcomingEvents.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No events or activities in the next seven days.
            </p>
          ) : (
            <ul className="dash-deadline-list">
              {(thisWeek.length > 0 ? thisWeek : upcomingEvents.slice(0, 5)).map(
                (c) => {
                  const isCal = 'kind' in c && 'startsAt' in c;
                  if (isCal) {
                    const item = c as (typeof calendarItems)[number];
                    return (
                      <li key={`${item.kind}-${item.id}`}>
                        <div>
                          <Link to={calHref(item)}>
                            <strong>{item.title}</strong>
                          </Link>
                          <div className="muted" style={{ fontSize: '0.78rem' }}>
                            {kindLabel(item.kind)}
                          </div>
                        </div>
                        <span className="dash-deadline-date">
                          {new Date(item.startsAt).toLocaleDateString(
                            undefined,
                            { weekday: 'short', month: 'short', day: 'numeric' },
                          )}
                        </span>
                      </li>
                    );
                  }
                  const e = c as (typeof events)[number];
                  return (
                    <li key={e.id}>
                      <div>
                        <Link to={`/events/${e.id}`}>
                          <strong>{e.name}</strong>
                        </Link>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>
                          {statusLabel(e.status)}
                        </div>
                      </div>
                      <span className="dash-deadline-date">
                        {e.startsAt
                          ? new Date(e.startsAt).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </span>
                    </li>
                  );
                },
              )}
            </ul>
          )}
        </section>

        {/* 3 · My tasks */}
        <section className="dash-card">
          <div className="dash-card-head">
            <CardTitle icon="task" tone="success">
              My tasks
            </CardTitle>
            <Link to="/tasks" className="muted">
              All →
            </Link>
          </div>
          <div className="dash-tabs" role="tablist" aria-label="Task filter">
            {(
              [
                ['all', 'All'],
                ['todo', 'To do'],
                ['progress', 'Doing'],
                ['done', 'Done'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={taskTab === id}
                className={`dash-tab${taskTab === id ? ' active' : ''}`}
                onClick={() => setTaskTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredTasks.length === 0 ? (
            <p className="muted" style={{ margin: '0.5rem 0 0' }}>
              No tasks in this view.{' '}
              {unreadCount > 0 ? (
                <Link to="/inbox">Check Inbox</Link>
              ) : (
                'Enjoy the quiet — or open Tasks to take something on.'
              )}
            </p>
          ) : (
            <ul className="dash-task-list">
              {filteredTasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link to={`/tasks/${t.id}`} className="dash-task-row">
                    <span className="dash-task-check" aria-hidden />
                    <span className="dash-task-body">
                      <strong>{t.title}</strong>
                      <span className="muted">
                        {t.systemId
                          ? systemsService.getById(t.systemId)?.shortName ??
                            'Ministry'
                          : 'Main Church'}
                      </span>
                    </span>
                    <StatusPill status={t.status} />
                    <span className="dash-task-due muted">
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 4 · Persona block */}
        {persona === 'secretary' && (
          <section className="dash-card">
            <div className="dash-card-head">
              <CardTitle icon="users" tone="sky">
                Directory
              </CardTitle>
              <Link to="/people" className="muted">
                People →
              </Link>
            </div>
            <p style={{ margin: 0 }}>
              <strong style={{ fontSize: '1.5rem' }}>{peopleCount}</strong>
              <span className="muted"> people in the registry</span>
            </p>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
              Keep records current so ministries know who they serve.
            </p>
            {canManagePeople ? (
              <div className="row" style={{ marginTop: '0.85rem' }}>
                <Link to="/people/new" className="btn sm">
                  Add person
                </Link>
                <Link to="/organization" className="btn ghost sm">
                  Organisation
                </Link>
              </div>
            ) : null}
          </section>
        )}

        {persona !== 'secretary' && (
          <section className="dash-card">
            <div className="dash-card-head">
              <CardTitle icon="folder" tone="accent">
                Open work
              </CardTitle>
              <Link to="/projects" className="muted">
                Projects →
              </Link>
            </div>
            {openProjects.length === 0 && programs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No open projects or programs in view yet.
              </p>
            ) : (
              <ul className="dash-feed">
                {openProjects.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <span className="dash-feed-mark" aria-hidden />
                    <div>
                      <Link to={`/projects/${p.id}`}>
                        <strong>{p.name}</strong>
                      </Link>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        Project · {statusLabel(p.status)}
                      </div>
                    </div>
                  </li>
                ))}
                {programs
                  .filter((p) => p.status === 'ACTIVE')
                  .slice(0, 3)
                  .map((p) => (
                    <li key={p.id}>
                      <span className="dash-feed-mark" aria-hidden />
                      <div>
                        <Link to={`/programs/${p.id}`}>
                          <strong>{p.name}</strong>
                        </Link>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Program · {statusLabel(p.status)}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {/* 5 · Ministries */}
        <section className="dash-card">
          <div className="dash-card-head">
            <CardTitle icon="systems" tone="sky">
              Your ministries
            </CardTitle>
            <Link to="/systems" className="muted">
              All →
            </Link>
          </div>
          {peerSystems.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No ministry systems on this account yet. Main Church tools are in
              the sidebar.
            </p>
          ) : (
            <ul className="dash-peer-list">
              {peerSystems.map((s) => (
                <li key={s.id}>
                  <span className="dash-peer-mark" aria-hidden>
                    {(s.shortName ?? s.name).slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{s.shortName ?? s.name}</strong>
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      {s.kind === 'MINISTRY'
                        ? 'Ministry'
                        : s.kind === 'MAIN'
                          ? 'Main Church'
                          : s.kind === 'SHARED'
                            ? 'Shared'
                            : 'System'}
                    </div>
                  </div>
                  <StatusPill
                    tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {statusLabel(s.status)}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 6 · Launcher */}
      <section className="dash-card dash-home-launcher">
        <div className="dash-card-head">
          <CardTitle icon="systems" tone="accent">
            Open a system
          </CardTitle>
        </div>
        <SystemLauncher compact excludeMain />
      </section>
    </div>
  );
}
