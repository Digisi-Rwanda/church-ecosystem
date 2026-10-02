import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { MusicLogEntry, MusicServiceSlot } from '../../domain/musicSchedule';
import { musicUnitName } from '../../domain/musicUnits';
import { musicScheduleService, protocolService } from '../../services';

const SYS = 'sys-protocol';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? key} ${y ?? ''}`;
}
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTION: Record<MusicLogEntry['action'], { label: string; pill: string }> = {
  CONFIRMED: { label: 'Confirmed', pill: 'pill' },
  RECONFIRMED: { label: 'Confirmed again', pill: 'pill warn' },
  PUBLISHED: { label: 'Published', pill: 'pill ok' },
  EDITED: { label: 'Edited', pill: 'pill warn' },
};

type MonthRow = {
  key: string;
  stage: 'CONFIRMED' | 'PUBLISHED';
  version: number;
  updatedAt: string;
  updatedBy?: string;
  services: MusicServiceSlot[];
  lineup: (serviceId: string) => string;
};

/**
 * Coordinator's view of Music: every month Music has confirmed or published,
 * and the permanent trail of every change to them. Each release or edit also
 * lands in the Coordinator's inbox.
 */
export function ProtocolMusicFeedPage() {
  const { can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const [stage, setStage] = useState<'ALL' | 'CONFIRMED' | 'PUBLISHED'>('ALL');
  const [month, setMonth] = useState('ALL');
  const [tick, setTick] = useState(0);

  const months = useMemo<MonthRow[]>(() => {
    const lineupOf = (assignments: { serviceId: string; unitId: string }[]) => (serviceId: string) => {
      const ids = [...new Set(assignments.filter((a) => a.serviceId === serviceId).map((a) => a.unitId))];
      return ids.length ? ids.map(musicUnitName).join(', ') : 'No choir';
    };
    const published: MonthRow[] = musicScheduleService.listPublished().map((p) => ({
      key: p.periodKey,
      stage: 'PUBLISHED' as const,
      version: p.version,
      updatedAt: p.updatedAt,
      updatedBy: p.updatedByPersonId,
      services: [...p.services].sort((a, b) => a.date.localeCompare(b.date)),
      lineup: lineupOf(p.assignments),
    }));
    const confirmed: MonthRow[] = musicScheduleService.listConfirmed().map((c) => ({
      key: c.periodKey,
      stage: 'CONFIRMED' as const,
      version: c.version,
      updatedAt: c.updatedAt,
      updatedBy: c.updatedByPersonId,
      services: [...c.services].sort((a, b) => a.date.localeCompare(b.date)),
      lineup: lineupOf(c.assignments),
    }));
    return [...confirmed, ...published].sort((a, b) => a.key.localeCompare(b.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const log = useMemo(
    () =>
      musicScheduleService
        .listLog()
        .filter((e) => (stage === 'ALL' || e.stage === stage) && (month === 'ALL' || e.periodKey === month)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, stage, month],
  );
  const shownMonths = months.filter((m) => (stage === 'ALL' || m.stage === stage) && (month === 'ALL' || m.key === month));
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = musicScheduleService.listLog().filter((e) => new Date(e.at).getTime() >= weekAgo).length;

  if (!canView) {
    return (
      <div className="panel">
        <h2>Music schedule</h2>
        <p className="muted">No PROTOCOL_SCHEDULE / VIEW</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Music schedule</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              What Music has confirmed or published, and every change made to it. Each release or edit also reaches
              your inbox.
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setTick((t) => t + 1)}>
            Refresh
          </button>
        </div>
        <div className="row" style={{ gap: '1.2rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <Tile value={months.filter((m) => m.stage === 'CONFIRMED').length} label="Confirmed, not yet released" />
          <Tile value={months.filter((m) => m.stage === 'PUBLISHED').length} label="Published" />
          <Tile value={recent} label="Changes in the last 7 days" />
        </div>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
            <option value="ALL">Confirmed and published</option>
            <option value="CONFIRMED">Confirmed only</option>
            <option value="PUBLISHED">Published only</option>
          </select>
          <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="ALL">All months</option>
            {[...new Set([...months.map((m) => m.key), ...musicScheduleService.listLog().map((e) => e.periodKey)])]
              .sort()
              .map((k) => (
                <option key={k} value={k}>
                  {monthName(k)}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Months</h3>
        {shownMonths.length === 0 && (
          <p className="muted">Nothing here yet. Months appear when Music confirms a draft.</p>
        )}
        <div className="stack" style={{ gap: '0.6rem' }}>
          {shownMonths.map((m) => {
            const count = musicScheduleService.listLog(m.key).length;
            return (
              <details key={`${m.stage}-${m.key}`} className="panel" style={{ margin: 0 }}>
                <summary style={{ cursor: 'pointer' }}>
                  <strong>{monthName(m.key)}</strong>{' '}
                  <span className={m.stage === 'PUBLISHED' ? 'pill ok' : 'pill'}>
                    {m.stage === 'PUBLISHED' ? 'Published' : 'Confirmed'}
                  </span>{' '}
                  <span className="muted">
                    v{m.version} · {m.services.length} services · {count} {count === 1 ? 'entry' : 'entries'} · updated{' '}
                    {when(m.updatedAt)}
                    {m.updatedBy ? ` by ${protocolService.personLabel(m.updatedBy)}` : ''}
                  </span>
                </summary>
                <div style={{ overflowX: 'auto', marginTop: '0.6rem' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Service</th>
                        <th>Choirs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.services.map((s) => (
                        <tr key={s.id}>
                          <td>{s.date}</td>
                          <td>{s.label}</td>
                          <td>{m.lineup(s.id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => setMonth(m.key)}>
                  Show only this month’s history
                </button>
              </details>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Change history</h3>
        {log.length === 0 && <p className="muted">No changes recorded yet.</p>}
        <div className="stack" style={{ gap: '0.7rem' }}>
          {log.map((e) => (
            <div key={e.id} style={{ borderLeft: '3px solid var(--border, #ccc)', paddingLeft: '0.8rem' }}>
              <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className={ACTION[e.action].pill}>{ACTION[e.action].label}</span>
                <strong>{monthName(e.periodKey)}</strong>
                <span className="muted">
                  {e.stage === 'PUBLISHED' ? 'published schedule' : 'confirmed month'} · v{e.version} ·{' '}
                  {when(e.at)} · {protocolService.personLabel(e.byPersonId)}
                </span>
              </div>
              {e.changes.length === 0 ? (
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  {e.summary}
                </p>
              ) : (
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                  {e.changes.map((c, i) => (
                    <li key={i}>{c.text}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
