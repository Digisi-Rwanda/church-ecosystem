import { useState, type ReactNode } from 'react';
import { useI18n, useT } from '../i18n/I18nContext';
import { Segmented } from './kit';

/** The little calendar tile at the head of a service card. */
export function DateTile({ date }: { date: string }) {
  const { locale } = useI18n();
  const d = new Date(`${date}T00:00:00Z`);
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
  return <span className="pt-date" aria-hidden><small>{wd}</small><strong>{d.getUTCDate()}</strong><small>{mon}</small></span>;
}

/** A short date for lists and PDFs, in the person's language. */
export function useShortDay() {
  const { locale } = useI18n();
  return (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function useMonthName() {
  const { locale } = useI18n();
  return (key: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
}

/* ── Three ways to look at the same schedule: cards, a list, a printed bulletin ── */
export type ScheduleViewKey = 'cards' | 'list' | 'bulletin';
const VIEW_STORE = 'moriah.scheduleView';
export function useScheduleView(): [ScheduleViewKey, (v: ScheduleViewKey) => void] {
  const [view, setView] = useState<ScheduleViewKey>(() => {
    try {
      const v = window.localStorage.getItem(VIEW_STORE);
      return v === 'list' || v === 'bulletin' ? v : 'cards';
    } catch {
      return 'cards';
    }
  });
  const set = (v: ScheduleViewKey) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_STORE, v); } catch { /* the choice just is not remembered */ }
  };
  return [view, set];
}

export function ViewSwitch({ value, onChange }: { value: ScheduleViewKey; onChange: (v: ScheduleViewKey) => void }) {
  const t = useT();
  return (
    <Segmented
      label={t('door.sch.view')}
      value={value}
      onChange={onChange}
      items={[{ key: 'cards', label: t('door.sch.view.cards') }, { key: 'list', label: t('door.sch.view.list') }, { key: 'bulletin', label: t('door.sch.view.bulletin') }]}
    />
  );
}

/** One service reduced to what a list or a bulletin needs. */
export type ScheduleRow = { id: string; date: string; title: string; names: Array<{ name: string; tag?: string }>; note?: string; chip?: ReactNode; onEdit?: () => void };

/** A plain table: date, service, who, with an Edit button where editing is allowed. */
export function ScheduleList({ rows }: { rows: ScheduleRow[] }) {
  const t = useT();
  const day = useShortDay();
  return (
    <div className="panel pt-list">
      <table className="table">
        <thead><tr><th>{t('door.sch.col.date')}</th><th>{t('door.sch.col.service')}</th><th>{t('door.sch.col.who')}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{day(r.date)}</td>
              <td>{r.title}{r.chip && <> {r.chip}</>}</td>
              <td>{r.names.length ? r.names.map((n) => (n.tag ? `${n.name} (${n.tag})` : n.name)).join(', ') : '-'}{r.note && <span className="muted"> · {r.note}</span>}</td>
              <td>{r.onEdit && <button type="button" className="btn secondary sm" onClick={r.onEdit}>{t('door.sch.edit')}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The schedule as the church would pin it up: one sheet, each date as a heading, the services under it. */
export function Bulletin({ rows, title, subtitle }: { rows: ScheduleRow[]; title: string; subtitle?: string }) {
  const { locale } = useI18n();
  const fmt = (d: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const byDay = new Map<string, ScheduleRow[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  return (
    <article className="pt-bulletin print-sheet">
      <header><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</header>
      {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => (
        <section key={d}>
          <h4>{fmt(d)}</h4>
          {list.map((r) => (
            <p key={r.id}><strong>{r.title}</strong>{' · '}{r.names.length ? r.names.map((n) => n.name).join(', ') : '-'}{r.note && <em> ({r.note})</em>}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
