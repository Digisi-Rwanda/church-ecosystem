import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/ui/FilterBar';
import { ForbiddenState, StatusPill } from '../components/ui/StatusPill';
import type { SystemId } from '../domain/types';
import { missionService, systemsService } from '../services';

type CalItem = ReturnType<typeof missionService.calendar>[number];

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null; day: number | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function itemHref(item: CalItem, basePath: string) {
  const root = basePath.replace(/\/$/, '');
  if (item.kind === 'EVENT') {
    return root ? `${root}/events/${item.id}` : `/events/${item.id}`;
  }
  if (item.programId) {
    return root
      ? `${root}/programs/${item.programId}`
      : `/programs/${item.programId}`;
  }
  return root ? `${root}/programs` : '/programs';
}

function kindLabel(kind: string) {
  if (kind === 'EVENT') return 'Event';
  if (kind === 'ACTIVITY') return 'Activity';
  return kind.replace(/_/g, ' ').toLowerCase();
}

export function CalendarPage({
  systemId = 'sys-main',
  basePath = '',
  title,
}: {
  systemId?: SystemId;
  basePath?: string;
  title?: string;
} = {}) {
  const { can, account, positions } = useAuth();
  const canView = can('PROGRAM', 'VIEW') || can('EVENT', 'VIEW');
  const [cursor, setCursor] = useState(() => new Date(2026, 8, 1)); // Sep 2026 seed
  const [mode, setMode] = useState<'month' | 'list'>('month');
  const items = missionService.calendar(systemId, {
    personId: account?.personId,
    positions,
    canEnterOwner: true,
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const label = cursor.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const item of items) {
      const d = new Date(item.startsAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  /** Nested ministry calendars keep an in-page title; Main uses AppShell. */
  const nestedTitle = title;
  const programsHref = basePath
    ? `${basePath.replace(/\/$/, '')}/programs`
    : '/programs';
  const eventsHref = basePath
    ? `${basePath.replace(/\/$/, '')}/events`
    : '/events';
  const tasksHref = basePath
    ? `${basePath.replace(/\/$/, '')}/tasks`
    : '/tasks';

  if (!canView) {
    return (
      <ForbiddenState
        resource="EVENT"
        action="VIEW"
        detail="You don’t have calendar access for this system."
        recovery={
          <Link to="/" className="btn secondary">
            Back home
          </Link>
        }
      />
    );
  }

  const modeToggle = (
    <div className="row">
      <button
        type="button"
        className={`btn sm ${mode === 'month' ? '' : 'ghost'}`}
        onClick={() => setMode('month')}
      >
        Month
      </button>
      <button
        type="button"
        className={`btn sm ${mode === 'list' ? '' : 'ghost'}`}
        onClick={() => setMode('list')}
      >
        List
      </button>
    </div>
  );

  return (
    <div className="list-page">
      <div className="list-chrome">
        {nestedTitle ? (
          <PageHead title={nestedTitle} actions={modeToggle} />
        ) : (
          <PageHead actions={modeToggle} />
        )}
        <div className="list-meta">
          <Link to={programsHref} className="badge">
            Programs
          </Link>
          <Link to={eventsHref} className="badge">
            Events
          </Link>
          <Link to={tasksHref} className="badge">
            Tasks
          </Link>
        </div>
      </div>

      {mode === 'month' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              ← Prev
            </button>
            <strong style={{ fontFamily: 'var(--font-display)' }}>{label}</strong>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              Next →
            </button>
          </div>
          <div className="cal-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((cell, i) => {
              if (!cell.date || cell.day == null) {
                return <div key={`e-${i}`} className="cal-cell empty" />;
              }
              const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
              const dayItems = byDay.get(key) ?? [];
              const isToday = sameDay(cell.date, new Date());
              return (
                <div
                  key={key}
                  className={`cal-cell ${isToday ? 'today' : ''}`}
                >
                  <div className="cal-daynum">{cell.day}</div>
                  <div className="cal-events">
                    {dayItems.slice(0, 3).map((item) => (
                      <Link
                        key={`${item.kind}-${item.id}`}
                        to={itemHref(item, basePath)}
                        className={`cal-chip ${item.kind === 'EVENT' ? 'event' : 'activity'}`}
                        title={item.title}
                      >
                        {item.title}
                      </Link>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="muted" style={{ fontSize: '0.7rem' }}>
                        +{dayItems.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'list' && (
        <div className="panel">
          {items.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing on the calendar yet.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td>
                      {new Date(item.startsAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <StatusPill
                        tone={item.kind === 'EVENT' ? 'info' : 'neutral'}
                      >
                        {kindLabel(item.kind)}
                      </StatusPill>
                    </td>
                    <td>
                      <Link to={itemHref(item, basePath)}>{item.title}</Link>
                    </td>
                    <td className="muted">
                      {systemsService.getById(item.systemId)?.shortName ??
                        'Main Church'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
