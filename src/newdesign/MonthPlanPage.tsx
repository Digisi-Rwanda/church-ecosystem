import { useState } from 'react';
import {
  confirmScheduleDraft, discardScheduleDraft, editScheduleDraft, editScheduleMonth, fetchScheduleDraft, fetchScheduleLog, fetchScheduleMonth, fetchScheduleState,
  generateScheduleDraft, publishScheduleDraft, publishScheduleMonths, type MusicHorizonKey, type ScheduleEdit, type ScheduleState,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { musicErrorKey, scheduleErrorText, servicesOfMonth } from './music';
import { ScheduleServiceCard } from './ScheduleServiceCard';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const HORIZONS: MusicHorizonKey[] = ['MONTH', 'QUARTER', 'HALF', 'YEAR'];
type View = { kind: 'home' } | { kind: 'draft'; id: string } | { kind: 'month'; key: string };

function useErrors() {
  const t = useT();
  const [error, setError] = useState('');
  const show = (err: unknown) => setError(scheduleErrorText(err) ?? t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  return { error, setError, show };
}

function Warnings({ list }: { list: string[] }) {
  const t = useT();
  if (list.length === 0) return null;
  return (
    <div className="panel" role="status">
      <strong>{t('door.music.sched.warnings')}</strong>
      <ul className="door-list">{list.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>
  );
}

function ChangeLog({ month }: { month: string }) {
  const t = useT();
  const { locale } = useI18n();
  const log = useLoad(() => fetchScheduleLog(month), `music-log|${month}`);
  return (
    <div className="panel">
      <h3>{t('door.music.sched.log')}</h3>
      <LoadState loading={log.loading} failed={log.failed} retry={log.reload}>
        {log.data && (log.data.entries.length === 0 ? (
          <p className="muted">{t('door.music.sched.log.none')}</p>
        ) : (
          <ul className="door-list">
            {log.data.entries.map((e) => (
              <li key={e.id}>
                <strong>{t(`door.music.sched.action.${e.action}` as 'door.music.sched.action.EDITED')}</strong> · v{e.version} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.at))} · {e.by}
                <br />
                <span className="muted">{e.summary}</span>
              </li>
            ))}
          </ul>
        ))}
      </LoadState>
    </div>
  );
}

function DraftView({ id, state, back }: { id: string; state: ScheduleState; back: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const draft = useLoad(() => fetchScheduleDraft(id), `music-draft|${id}`);
  const { error, setError, show } = useErrors();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [live, setLive] = useState<string[]>([]);
  const d = draft.data;
  const open = (d?.months ?? []).filter((m) => m.decided !== 'PUBLISHED').map((m) => m.periodKey);
  const chosen = picked ?? open;
  const run = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      draft.reload();
    } catch (err) {
      show(err);
    }
  };
  const edit = (e: ScheduleEdit) => void run(async () => setLive((await editScheduleDraft(id, e)).warnings));
  const monthName = (k: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}-01T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-draft-title">
      <p><button type="button" className="btn ghost" onClick={back}>{t('door.music.back')}</button></p>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={draft.loading} failed={draft.failed} retry={draft.reload}>
        {d && (
          <>
            <div>
              <PageHeader id="door-draft-title" title={t('door.music.sched.draftTitle', { label: d.label })} />
              <p className="muted">{t('door.music.sched.draftHint')}</p>
            </div>
            <Warnings list={live.length ? live : d.warnings} />
            <div className="panel door-form">
              <h3>{t('door.music.sched.months')}</h3>
              <ul className="door-list">
                {d.months.map((m) => (
                  <li key={m.periodKey}>
                    <label>
                      <input type="checkbox" disabled={m.decided === 'PUBLISHED'} checked={chosen.includes(m.periodKey) && m.decided !== 'PUBLISHED'} onChange={(e) => setPicked(e.target.checked ? [...chosen, m.periodKey] : chosen.filter((x) => x !== m.periodKey))} /> {monthName(m.periodKey)}
                      {m.decided && <span className="door-chip"> {t(`door.music.sched.state.${m.decided}` as 'door.music.sched.state.CONFIRMED')}</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="door-row">
                <button type="button" className="btn" disabled={chosen.length === 0} onClick={() => void run(() => confirmScheduleDraft(id, chosen), back)}>{t('door.music.sched.confirm')}</button>
                <button type="button" className="btn secondary" onClick={() => void run(() => publishScheduleDraft(id), back)}>{t('door.music.sched.publishAll')}</button>
                <button type="button" className="btn ghost" onClick={() => void run(() => discardScheduleDraft(id), back)}>{t('door.music.sched.discard')}</button>
              </div>
              <p className="muted">{t('door.music.sched.confirmHint')}</p>
            </div>
            {d.months.map((m) => (
              <div key={m.periodKey}>
                <h3>{monthName(m.periodKey)}</h3>
                <ul className="door-notices">
                  {servicesOfMonth(d.services, m.periodKey).map((s) => <ScheduleServiceCard key={s.id} service={s} units={state.units} onEdit={m.decided === 'PUBLISHED' ? undefined : edit} />)}
                </ul>
              </div>
            ))}
          </>
        )}
      </LoadState>
    </section>
  );
}

function MonthView({ month, state, back, reloadState }: { month: string; state: ScheduleState; back: () => void; reloadState: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const data = useLoad(() => fetchScheduleMonth(month), `music-month|${month}`);
  const { error, setError, show } = useErrors();
  const [live, setLive] = useState<string[]>([]);
  const m = data.data;
  const edit = async (e: ScheduleEdit) => {
    setError('');
    try {
      setLive((await editScheduleMonth(month, e)).warnings);
      data.reload();
      reloadState();
    } catch (err) {
      show(err);
    }
  };
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-month-title">
      <p><button type="button" className="btn ghost" onClick={back}>{t('door.music.back')}</button></p>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {m && (
          <>
            <div>
              <PageHeader id="door-month-title" title={monthName} />
              <p className="muted"><span className="door-chip">{t(`door.music.sched.state.${m.state}` as 'door.music.sched.state.CONFIRMED')}</span> v{m.version}</p>
              {m.canWrite && <p className="muted">{m.state === 'PUBLISHED' ? t('door.music.sched.editPublishedHint') : t('door.music.sched.editConfirmedHint')}</p>}
            </div>
            <Warnings list={live.length ? live : m.warnings} />
            <ul className="door-notices">
              {m.services.map((s) => <ScheduleServiceCard key={s.id} service={s} units={state.units} onEdit={m.canWrite ? (e) => void edit(e) : undefined} />)}
            </ul>
            {m.canWrite && <ChangeLog month={month} />}
          </>
        )}
      </LoadState>
    </section>
  );
}

/**
 * Music's schedule, run by the old engine: build a draft for a month up to a year, adjust it
 * (hard rules refuse, soft ones warn), confirm months for Protocol to plan against, publish them
 * to the choirs, and edit afterwards with every change logged.
 */
export function MonthPlanPage() {
  const t = useT();
  const { locale } = useI18n();
  const state = useLoad(fetchScheduleState, 'music-sched');
  const [view, setView] = useState<View>({ kind: 'home' });
  const [horizon, setHorizon] = useState<MusicHorizonKey>('MONTH');
  const [start, setStart] = useState('');
  const { error, setError, show } = useErrors();
  const [busy, setBusy] = useState(false);
  const s = state.data;
  const home = () => { setView({ kind: 'home' }); state.reload(); };
  const options = s?.options[horizon] ?? [];
  const build = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await generateScheduleDraft(horizon, start || options[0]?.value || '');
      state.reload();
      setView({ kind: 'draft', id: r.id });
    } catch (err) {
      show(err);
    } finally {
      setBusy(false);
    }
  };
  const publish = async (m: string) => {
    setError('');
    try {
      await publishScheduleMonths([m]);
      state.reload();
    } catch (err) {
      show(err);
    }
  };
  const monthName = (k: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}-01T00:00:00Z`));
  if (view.kind === 'draft' && s) return <DraftView id={view.id} state={s} back={home} />;
  if (view.kind === 'month' && s) return <MonthView month={view.key} state={s} back={home} reloadState={state.reload} />;
  return (
    <section className="door-block" aria-labelledby="door-plan-title">
      <div>
        <PageHeader id="door-plan-title" title={t('door.own.monthplan')} />
        <p className="muted">{t('door.music.sched.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={state.loading} failed={state.failed} retry={state.reload}>
        {s && (
          <>
            {s.canWrite && (
              <div className="panel door-form">
                <h3>{t('door.music.sched.build')}</h3>
                <SelectField label={t('door.music.sched.horizon')} name="g-horizon" value={horizon} onChange={(e) => { setHorizon(e.target.value as MusicHorizonKey); setStart(''); }}>
                  {HORIZONS.map((h) => <option key={h} value={h}>{t(`door.music.sched.horizon.${h}` as 'door.music.sched.horizon.MONTH')}</option>)}
                </SelectField>
                <SelectField label={t('door.music.sched.period')} name="g-start" value={start || options[0]?.value || ''} onChange={(e) => setStart(e.target.value)}>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <div><button type="button" className="btn" disabled={busy} onClick={() => void build()}>{busy ? t('door.music.sched.building') : t('door.music.sched.buildNow')}</button></div>
                <p className="muted">{t('door.music.sched.buildHint')}</p>
              </div>
            )}
            {s.canWrite && s.drafts.length > 0 && (
              <div className="panel">
                <h3>{t('door.music.sched.drafts')}</h3>
                <ul className="door-list">
                  {s.drafts.map((d) => (
                    <li key={d.id} className="door-row">
                      <span>{d.label} <span className="muted">· {t('door.music.sched.monthsCount', { count: String(d.months.length) })}{d.warnings > 0 ? ` · ${t('door.music.sched.warningsCount', { count: String(d.warnings) })}` : ''}</span></span>
                      <button type="button" className="btn" onClick={() => setView({ kind: 'draft', id: d.id })}>{t('door.music.sched.open')}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="panel">
              <h3>{t('door.music.sched.decided')}</h3>
              {s.months.length === 0 ? (
                <EmptyState title={s.canWrite ? t('door.music.plan.noneYet') : t('door.music.plan.notPublished')} />
              ) : (
                <ul className="door-list">
                  {s.months.map((m) => (
                    <li key={m.periodKey} className="door-row">
                      <span>
                        <strong>{monthName(m.periodKey)}</strong> <span className={`door-chip${m.state === 'CONFIRMED' ? ' warn' : ''}`}>{t(`door.music.sched.state.${m.state}` as 'door.music.sched.state.CONFIRMED')}</span> <span className="muted">v{m.version}</span>
                      </span>
                      <span className="door-row">
                        {s.canWrite && m.state === 'CONFIRMED' && <button type="button" className="btn secondary" onClick={() => void publish(m.periodKey)}>{t('door.music.plan.publish')}</button>}
                        <button type="button" className="btn" onClick={() => setView({ kind: 'month', key: m.periodKey })}>{t('door.music.sched.open')}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
