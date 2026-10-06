import { Link } from 'react-router-dom';
import type { WorkItem } from '../domain/workItem';
import { EmptyState, StatusPill } from './ui/StatusPill';

export type WorkViewMode = 'list' | 'board' | 'calendar';

export function WorkViewToggle({
  value,
  onChange,
}: {
  value: WorkViewMode;
  onChange: (v: WorkViewMode) => void;
}) {
  return (
    <div className="work-view-toggle" role="group" aria-label="View">
      {(['list', 'board', 'calendar'] as WorkViewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          className="tab"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
        >
          {mode === 'list' ? 'List' : mode === 'board' ? 'Board' : 'Calendar'}
        </button>
      ))}
    </div>
  );
}

function healthPill(item: WorkItem) {
  if (!item.health) return null;
  const tone =
    item.health.tone === 'green'
      ? 'success'
      : item.health.tone === 'amber'
        ? 'warn'
        : item.health.tone === 'red'
          ? 'danger'
          : 'neutral';
  return (
    <StatusPill tone={tone}>
      {item.health.score} {item.health.label}
    </StatusPill>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  return (
    <tr>
      <td>
        <Link to={item.href}>
          <strong>{item.title}</strong>
        </Link>
        <div className="muted" style={{ fontSize: '0.8rem' }}>
          {item.kind}
        </div>
      </td>
      <td>
        <StatusPill status={item.status} />
      </td>
      <td>{healthPill(item)}</td>
      <td>
        {item.startsAt || item.dueDate ? (
          <span className="muted">
            {item.dueDate
              ? `Due ${item.dueDate}`
              : new Date(item.startsAt!).toLocaleDateString()}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

const BOARD_COLUMNS: Record<string, string[]> = {
  PROGRAM: ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'ACTIVE', 'CLOSING', 'ENDED'],
  PROJECT: [
    'DRAFT',
    'PENDING_APPROVAL',
    'PLANNED',
    'ACTIVE',
    'PAUSED',
    'CLOSING',
    'DONE',
    'CANCELLED',
  ],
  EVENT: ['DRAFT', 'PENDING_APPROVAL', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  TASK: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
};

/**
 * Shared List | Board | Calendar presentation for WorkItem projections.
 */
export function WorkItemViews({
  items,
  view,
  emptyTitle = 'Nothing here yet',
}: {
  items: WorkItem[];
  view: WorkViewMode;
  emptyTitle?: string;
}) {
  if (items.length === 0) {
    return <EmptyState variant="first-use" title={emptyTitle} />;
  }

  if (view === 'list') {
    return (
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Health</th>
              <th>Money / date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <WorkItemRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === 'board') {
    const kind = items[0]?.kind ?? 'PROGRAM';
    const cols = BOARD_COLUMNS[kind] ?? [
      ...new Set(items.map((i) => i.status)),
    ];
    return (
      <div className="work-board">
        {cols.map((status) => {
          const colItems = items.filter((i) => i.status === status);
          return (
            <div key={status} className="work-board-col">
              <div className="work-board-col-head">
                <StatusPill status={status} />
                <span className="muted">{colItems.length}</span>
              </div>
              <div className="work-board-col-body">
                {colItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    className="work-board-card"
                  >
                    <strong>{item.title}</strong>
                    {item.health && (
                      <div style={{ marginTop: '0.35rem' }}>
                        {healthPill(item)}
                      </div>
                    )}
                  </Link>
                ))}
                {colItems.length === 0 && (
                  <p className="muted" style={{ fontSize: '0.8rem' }}>
                    —
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Calendar — group by date (startsAt / dueDate)
  const byDate = new Map<string, WorkItem[]>();
  for (const item of items) {
    const raw = item.startsAt ?? item.dueDate ?? item.nextSessionAt;
    const key = raw ? raw.slice(0, 10) : 'Unscheduled';
    const list = byDate.get(key) ?? [];
    list.push(item);
    byDate.set(key, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => {
    if (a === 'Unscheduled') return 1;
    if (b === 'Unscheduled') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="work-calendar stack">
      {dates.map((date) => (
        <div key={date} className="panel" style={{ padding: '0.85rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
            {date === 'Unscheduled'
              ? 'Unscheduled'
              : new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
          </h3>
          <ul className="dash-list">
            {(byDate.get(date) ?? []).map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <StatusPill status={item.status} />{' '}
                <Link to={item.href}>{item.title}</Link>
                <span className="muted"> · {item.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
