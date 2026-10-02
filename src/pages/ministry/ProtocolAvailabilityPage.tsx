import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Drawer } from '../../components/ui/Drawer';
import { useToast } from '../../components/ui/Toast';
import { MUSIC_SERVICE_LABELS } from '../../domain/musicSchedule';
import { buildMusicCalendar } from '../../domain/musicScheduleEngine';
import type { ProtocolRosterMember, ProtocolServiceKind } from '../../domain/types';
import { protocolService } from '../../services';

const SYS = 'sys-protocol';
const KINDS: ProtocolServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'];
const SHORT: Record<ProtocolServiceKind, string> = {
  SS1: 'Sunday 1',
  SS2: 'Sunday 2',
  TUESDAY: 'Tuesday',
  IGABURO: 'Igaburo',
};
const STATUS: Record<ProtocolRosterMember['status'], string> = {
  ACTIVE: 'Active',
  LEAVE: 'On leave',
  INACTIVE: 'Inactive',
};

/** Services a member can be put on, whichever way the rule is stored. */
function servesOf(m: ProtocolRosterMember): ProtocolServiceKind[] {
  if (m.allowedServiceKinds?.length) return m.allowedServiceKinds;
  return KINDS.filter((k) =>
    k === 'TUESDAY'
      ? m.serveDays === 'TUESDAY' || m.serveDays === 'BOTH'
      : m.serveDays === 'SUNDAY' || m.serveDays === 'BOTH',
  );
}

type Picked = NonNullable<ProtocolRosterMember['onlyServices']>;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[(m ?? 1) - 1]}`;
};
/** "Oct: 4 SS1, 11 SS2 · Nov: 1 SS1" */
function pickedSummary(list?: Picked): string {
  if (!list?.length) return 'Follows the usual rule';
  const byMonth = new Map<string, string[]>();
  for (const x of list) {
    const k = x.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), `${Number(x.date.slice(8))} ${SHORT[x.kind]}`]);
  }
  return [...byMonth]
    .map(([k, v]) => `${MON[Number(k.slice(5)) - 1]}: ${v.join(', ')}`)
    .join(' · ');
}

/**
 * Availability: for each member the Coordinator sets whether they are active,
 * on leave or inactive, which services they serve, and the dates they cannot
 * serve. The team builder reads exactly this.
 */
export function ProtocolAvailabilityPage() {
  const { account, can } = useAuth();
  const { push } = useToast();
  const canView = can('PROTOCOL_ROSTER', 'VIEW', SYS);
  const canManage = can('PROTOCOL_ROSTER', 'MANAGE', SYS);
  const iCan = canManage && !!account && protocolService.isCoordinator(account.personId);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | ProtocolRosterMember['status']>('ALL');
  const [dateFor, setDateFor] = useState<string | null>(null);
  const [svcFor, setSvcFor] = useState<string | null>(null);

  const roster = useMemo(
    () => protocolService.rosterWithNames(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const rows = roster.filter(
    (m) =>
      (status === 'ALL' || m.status === status) &&
      m.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const svcMember = svcFor ? (roster.find((m) => m.id === svcFor) ?? null) : null;
  const dateMember = dateFor ? (roster.find((m) => m.id === dateFor) ?? null) : null;

  function apply(
    id: string,
    patch: Parameters<typeof protocolService.rosterUpdate>[1],
    okMsg = 'Saved',
  ) {
    const r = protocolService.rosterUpdate(id, patch, account!.personId);
    push({ title: r.ok ? okMsg : (r.reason ?? 'Failed'), tone: r.ok ? 'success' : 'danger' });
    setTick((t) => t + 1);
  }

  if (!canView) {
    return (
      <div className="panel">
        <h2>Availability</h2>
        <p className="muted">No PROTOCOL_ROSTER / VIEW</p>
      </div>
    );
  }

  const count = (s: ProtocolRosterMember['status']) => roster.filter((m) => m.status === s).length;

  return (
    <div className="stack">
      <div className="panel">
        <h2 style={{ margin: 0 }}>Availability</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Who can serve, and at which services. Teams are built only from members who are active, serve that
          service, and are free on that date.
          {!iCan && ' Only the Coordinator can change this.'}
        </p>
        <div className="row" style={{ gap: '1.2rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <span>
            <strong>{count('ACTIVE')}</strong> <span className="muted">active</span>
          </span>
          <span>
            <strong>{count('LEAVE')}</strong> <span className="muted">on leave</span>
          </span>
          <span>
            <strong>{count('INACTIVE')}</strong> <span className="muted">inactive</span>
          </span>
        </div>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <input
            type="search"
            placeholder="Find a member"
            aria-label="Find a member"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="ALL">Everyone</option>
            <option value="ACTIVE">Active</option>
            <option value="LEAVE">On leave</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Status</th>
              <th>Usually serves</th>
              <th>Particular services</th>
              <th>Not available on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const serves = servesOf(m);
              const fixed = m.office === 'COORDINATOR';
              return (
                <tr key={m.id} style={m.status === 'INACTIVE' ? { opacity: 0.6 } : undefined}>
                  <td>
                    {m.name}
                    <div className="muted">{protocolService.officeLabel(m.office)}</div>
                  </td>
                  <td>
                    {iCan ? (
                      <select
                        aria-label={`Status of ${m.name}`}
                        value={m.status}
                        onChange={(e) =>
                          apply(m.id, { status: e.target.value as ProtocolRosterMember['status'] }, 'Status updated')
                        }
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="LEAVE">On leave</option>
                        <option value="INACTIVE" disabled={fixed}>
                          Inactive
                        </option>
                      </select>
                    ) : (
                      <span className={m.status === 'ACTIVE' ? 'pill ok' : 'pill warn'}>{STATUS[m.status]}</span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                      {KINDS.map((k) => {
                        const on = serves.includes(k);
                        return (
                          <label
                            key={k}
                            className={on ? 'pill ok' : 'pill'}
                            title={MUSIC_SERVICE_LABELS[k]}
                            style={{ cursor: iCan ? 'pointer' : 'default', opacity: on ? 1 : 0.6 }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!iCan}
                              onChange={() => {
                                const next = on ? serves.filter((x) => x !== k) : [...serves, k];
                                apply(m.id, { allowedServiceKinds: next }, 'Services updated');
                              }}
                              style={{ marginRight: '0.3rem' }}
                            />
                            {SHORT[k]}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <span className={m.onlyServices?.length ? '' : 'muted'}>{pickedSummary(m.onlyServices)}</span>{' '}
                    {iCan && (
                      <button type="button" className="btn ghost sm" onClick={() => setSvcFor(m.id)}>
                        {m.onlyServices?.length ? 'Edit' : 'Pick services'}
                      </button>
                    )}
                  </td>
                  <td>
                    {m.unavailableDates.length ? (
                      <span>
                        {m.unavailableDates.length} {m.unavailableDates.length === 1 ? 'date' : 'dates'}{' '}
                        <span className="muted">
                          ({m.unavailableDates[0]}
                          {m.unavailableDates.length > 1 ? ` … ${m.unavailableDates[m.unavailableDates.length - 1]}` : ''})
                        </span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}{' '}
                    {iCan && (
                      <button type="button" className="btn ghost sm" onClick={() => setDateFor(m.id)}>
                        {m.unavailableDates.length ? 'Edit' : 'Add dates'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {roster.length === 0
                    ? 'No one on the roster yet. Add members on the Members page.'
                    : 'No one matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {svcMember && (
        <ServicesDrawer
          key={svcMember.id}
          name={svcMember.name}
          picked={svcMember.onlyServices ?? []}
          onClose={() => setSvcFor(null)}
          onSave={(list) => {
            apply(svcMember.id, { onlyServices: list }, 'Services saved');
            setSvcFor(null);
          }}
        />
      )}

      {dateMember && (
        <DatesDrawer
          key={dateMember.id}
          name={dateMember.name}
          dates={dateMember.unavailableDates}
          onClose={() => setDateFor(null)}
          onSave={(dates) => {
            apply(dateMember.id, { unavailableDates: dates }, 'Dates saved');
            setDateFor(null);
          }}
        />
      )}
    </div>
  );
}

function DatesDrawer({
  name,
  dates,
  onClose,
  onSave,
}: {
  name: string;
  dates: string[];
  onClose: () => void;
  onSave: (dates: string[]) => void;
}) {
  const months = useMemo(() => nextMonths(12), []);
  const [month, setMonth] = useState(months[0]!);
  const [sel, setSel] = useState<Set<string>>(() => new Set(dates));

  /** date -> the services held that day, for every month on offer. */
  const calendar = useMemo(() => {
    const byDate = new Map<string, ProtocolServiceKind[]>();
    for (const m of months) {
      for (const s of buildMusicCalendar(m, 'MONTH')) {
        if (!KINDS.includes(s.kind as ProtocolServiceKind)) continue; // no Friday
        byDate.set(s.date, [...(byDate.get(s.date) ?? []), s.kind as ProtocolServiceKind]);
      }
    }
    return byDate;
  }, [months]);

  const [y, mo] = month.split('-').map(Number) as [number, number];
  const firstWeekday = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const monthServiceDates = [...calendar.keys()].filter((d) => d.startsWith(month)).sort();
  const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const countIn = (m: string) => [...sel].filter((d) => d.startsWith(m)).length;

  const toggle = (d: string) =>
    setSel((c) => {
      const n = new Set(c);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  /** Select these dates, or clear them if they are all selected already. */
  const toggleMany = (list: string[]) =>
    setSel((c) => {
      const n = new Set(c);
      const allOn = list.length > 0 && list.every((d) => n.has(d));
      for (const d of list) {
        if (allOn) n.delete(d);
        else n.add(d);
      }
      return n;
    });

  // Dates saved earlier that are not a service day on this calendar (kept, can be removed).
  const otherDates = [...sel].filter((d) => !calendar.has(d)).sort();
  const step = (by: number) => {
    const i = months.indexOf(month) + by;
    if (i >= 0 && i < months.length) setMonth(months[i]!);
  };

  return (
    <Drawer
      open
      wide
      title={name}
      subtitle="Dates not available"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => onSave([...sel].sort())}>
            Save {sel.size ? `(${sel.size})` : ''}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Tap the service days this person cannot serve. A selected day means none of that day&apos;s services.
        </p>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn ghost sm" aria-label="Previous month" onClick={() => step(-1)}>
            ‹
          </button>
          <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {MON[Number(m.slice(5)) - 1]} {m.slice(0, 4)}
                {countIn(m) ? ` • ${countIn(m)}` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost sm" aria-label="Next month" onClick={() => step(1)}>
            ›
          </button>
        </div>
        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => toggleMany(monthServiceDates.filter((d) => weekdayOf(d) === 0))}
          >
            All Sundays
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => toggleMany(monthServiceDates.filter((d) => weekdayOf(d) === 2))}
          >
            All Tuesdays
          </button>
          <button type="button" className="btn secondary sm" onClick={() => toggleMany(monthServiceDates)}>
            Whole month
          </button>
          {countIn(month) > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setSel((c) => new Set([...c].filter((d) => !d.startsWith(month))))}
            >
              Clear this month
            </button>
          )}
        </div>
        <div
          role="grid"
          aria-label="Service calendar"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.3rem' }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
            <div key={w} className="muted" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
              {w}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const date = `${month}-${String(day).padStart(2, '0')}`;
            const kinds = calendar.get(date);
            if (!kinds) {
              return (
                <div key={date} className="muted" style={{ textAlign: 'center', padding: '0.4rem 0', opacity: 0.4 }}>
                  {day}
                </div>
              );
            }
            const on = sel.has(date);
            return (
              <button
                key={date}
                type="button"
                className={on ? 'btn' : 'btn secondary'}
                aria-pressed={on}
                aria-label={`${dayLabel(date)}, ${kinds.map((k) => SHORT[k]).join(' and ')}${on ? ', not available' : ''}`}
                onClick={() => toggle(date)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.3rem 0.1rem', gap: 0 }}
              >
                <strong>{day}</strong>
                <span style={{ fontSize: '0.65rem', lineHeight: 1.2 }}>{kinds.map((k) => k.replace('TUESDAY', 'Tue').replace('IGABURO', 'Igab')).join(' ')}</span>
              </button>
            );
          })}
        </div>
        {otherDates.length > 0 && (
          <div className="stack" style={{ gap: '0.3rem' }}>
            <span className="muted">Other saved dates (not service days)</span>
            <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
              {otherDates.map((d) => (
                <span key={d} className="pill">
                  {d}{' '}
                  <button type="button" className="btn ghost sm" aria-label={`Remove ${d}`} onClick={() => toggle(d)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

const nextMonths = (n: number) => {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

/**
 * Pick exact services on the calendar, e.g. 4 Oct SS1 and 11 Oct SS2. In a
 * month with any pick only those are used; a month with none follows the usual rule.
 */
function ServicesDrawer({
  name,
  picked,
  onClose,
  onSave,
}: {
  name: string;
  picked: Picked;
  onClose: () => void;
  onSave: (list: Picked) => void;
}) {
  const months = useMemo(() => nextMonths(12), []);
  const [month, setMonth] = useState(months[0]!);
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(picked.map((x) => `${x.date}|${x.kind}`)),
  );
  const days = useMemo(() => {
    const byDate = new Map<string, ProtocolServiceKind[]>();
    for (const s of buildMusicCalendar(month, 'MONTH')) {
      if (!KINDS.includes(s.kind as ProtocolServiceKind)) continue; // Protocol does not staff Friday
      byDate.set(s.date, [...(byDate.get(s.date) ?? []), s.kind as ProtocolServiceKind]);
    }
    return [...byDate].sort(([a], [b]) => a.localeCompare(b));
  }, [month]);
  const inMonth = [...sel].filter((k) => k.slice(0, 7) === month).length;
  const toggle = (k: string) =>
    setSel((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Drawer
      open
      wide
      title={name}
      subtitle="Particular services"
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
              onSave(
                [...sel].map((k) => {
                  const [date, kind] = k.split('|') as [string, ProtocolServiceKind];
                  return { date, kind };
                }),
              )
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Tick the services this person can do. In a month where you tick any, only those are used; a month
          with nothing ticked follows their usual services.
        </p>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {MON[Number(m.slice(5)) - 1]} {m.slice(0, 4)}
                {[...sel].some((k) => k.slice(0, 7) === m) ? ' •' : ''}
              </option>
            ))}
          </select>
          {inMonth > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setSel((c) => new Set([...c].filter((k) => k.slice(0, 7) !== month)))}
            >
              Clear this month
            </button>
          )}
        </div>
        <div className="stack" style={{ gap: '0.5rem' }}>
          {days.map(([date, kinds]) => (
            <div key={date} className="row" style={{ gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ width: '5.5rem' }}>
                {new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}{' '}
                {dayLabel(date)}
              </strong>
              {kinds.map((k) => {
                const key = `${date}|${k}`;
                const on = sel.has(key);
                return (
                  <label key={key} className={on ? 'pill ok' : 'pill'} style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(key)}
                      style={{ marginRight: '0.3rem' }}
                    />
                    {SHORT[k]}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
