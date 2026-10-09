import { useState } from 'react';
import {
  confirmScheduleDraft, discardScheduleDraft, editScheduleDraft, editScheduleMonth, fetchScheduleDraft, fetchScheduleLog, fetchScheduleMonth, fetchScheduleState,
  generateScheduleDraft, publishScheduleMonths, type MusicHorizonKey, type ScheduleEdit, type ScheduleService, type ScheduleState,
} from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { addableUnits, musicErrorKey, scheduleErrorText, servicesOfMonth } from './music';
import { Bulletin, DateTile, ScheduleList, ViewSwitch, useMonthName, useScheduleView, useShortDay, type ScheduleRow, type ScheduleViewKey } from './ScheduleShared';
import { downloadSchedulePdf } from './schedulePdf';
import { useLoad } from './useLoad';
import { EmptyState, PageHeader, SidePanel, Tabs } from './kit';

const HORIZONS: MusicHorizonKey[] = ['MONTH', 'QUARTER', 'HALF', 'YEAR'];
type Tab = 'generated' | 'confirmed' | 'published';
type Units = ScheduleState['units'];
type Edit = (e: ScheduleEdit) => Promise<unknown>;

/** One service: the date, the kind and the choirs on it. Edit opens a side panel. */
function ServiceCard({ svc, onEdit }: { svc: ScheduleService; onEdit?: () => void }) {
  const t = useT();
  return (
    <li className="pt-card">
      <div className="pt-card-head">
        <DateTile date={svc.date} />
        <div className="pt-card-title"><strong>{t(`door.music.kind.${svc.kind}` as 'door.music.kind.SS1')}</strong></div>
      </div>
      {svc.units.length === 0 ? (
        <p className="muted">{t('door.music.noChoirYet')}</p>
      ) : (
        <ul className="pt-people">
          {svc.units.map((u) => (
            <li key={u.unitId} className="pt-person">
              <span className="pt-avatar" aria-hidden>{u.name.slice(0, 2).toUpperCase()}</span>
              <span className="pt-name">{u.name}</span>
              <span className="pt-tag">{t(`door.music.role.${u.kind}` as 'door.music.role.PRIMARY')}</span>
            </li>
          ))}
        </ul>
      )}
      {onEdit && <button type="button" className="btn secondary sm" onClick={onEdit}>{t('door.sch.edit')}</button>}
    </li>
  );
}

/** Add, replace or remove the choirs of one service. */
function EditPanel({ svc, units, edit, onClose }: { svc: ScheduleService; units: Units; edit: Edit; onClose: () => void }) {
  const t = useT();
  const day = useShortDay();
  const free = addableUnits(units, svc);
  return (
    <SidePanel open title={`${day(svc.date)} · ${t(`door.music.kind.${svc.kind}` as 'door.music.kind.SS1')}`} onClose={onClose}>
      <div className="pt-edit">
        <ul className="pt-edit-list">
          {svc.units.map((u) => {
            const swaps = free.filter((x) => x.kind === u.kind);
            return (
              <li key={u.unitId} className="pt-edit-row">
                <span className="pt-avatar" aria-hidden>{u.name.slice(0, 2).toUpperCase()}</span>
                <span className="pt-edit-name"><strong>{u.name}</strong></span>
                {swaps.length > 0 && (
                  <SelectField label={t('door.music.sched.replaceWith')} name={`r-${svc.id}-${u.unitId}`} value="" onChange={(e) => e.target.value && void edit({ serviceId: svc.id, action: 'replace', unitId: u.unitId, toUnitId: e.target.value })}>
                    <option value="">{t('door.gov.meeting.choose')}</option>
                    {swaps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </SelectField>
                )}
                <button type="button" className="btn ghost sm" onClick={() => void edit({ serviceId: svc.id, action: 'remove', unitId: u.unitId })}>{t('door.groups.remove')}</button>
              </li>
            );
          })}
        </ul>
        {free.length > 0 && (
          <SelectField label={t('door.music.addChoir')} name={`a-${svc.id}`} value="" onChange={(e) => e.target.value && void edit({ serviceId: svc.id, action: 'add', unitId: e.target.value })}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </SelectField>
        )}
        <button type="button" className="btn" onClick={onClose}>{t('door.protocol.panel.done')}</button>
      </div>
    </SidePanel>
  );
}

/** The services of a schedule, grouped by month, with the edit panel. */
function Services({ services, months, units, edit, view }: { services: ScheduleService[]; months: string[]; units: Units; edit?: Edit; view: ScheduleViewKey }) {
  const t = useT();
  const monthName = useMonthName();
  const [editing, setEditing] = useState<string | null>(null);
  const cur = services.find((s) => s.id === editing);
  const rows: ScheduleRow[] = months.flatMap((m) => servicesOfMonth(services, m)).map((s) => ({
    id: s.id, date: s.date, title: t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1'), names: s.units.map((u) => ({ name: u.name, tag: t(`door.music.role.${u.kind}` as 'door.music.role.PRIMARY') })),
    onEdit: edit ? () => setEditing(s.id) : undefined,
  }));
  return (
    <>
      {view === 'list' && <ScheduleList rows={rows} />}
      {view === 'bulletin' && <Bulletin rows={rows} title={months.length === 1 ? monthName(months[0]!) : t('door.own.monthplan')} subtitle={months.length > 1 ? `${monthName(months[0]!)} – ${monthName(months[months.length - 1]!)}` : undefined} />}
      {view === 'cards' && months.map((m) => (
        <div key={m} className="pt-month-block">
          {months.length > 1 && <h3>{monthName(m)}</h3>}
          <ul className="pt-grid">
            {servicesOfMonth(services, m).map((s) => <ServiceCard key={s.id} svc={s} onEdit={edit ? () => setEditing(s.id) : undefined} />)}
          </ul>
        </div>
      ))}
      {edit && cur && <EditPanel svc={cur} units={units} edit={edit} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Pick one of several drafts or months. */
function Picker({ items, value, onPick }: { items: Array<{ key: string; label: string }>; value: string; onPick: (k: string) => void }) {
  if (items.length < 2) return null;
  return (
    <div className="pt-picker">
      {items.map((i) => <button key={i.key} type="button" className="tab" aria-pressed={value === i.key} onClick={() => onPick(i.key)}>{i.label}</button>)}
    </div>
  );
}

function Notes({ list }: { list: string[] }) {
  const t = useT();
  if (list.length === 0) return null;
  return (
    <details className="panel pt-more">
      <summary>{t('door.music.sched.warningsCount', { count: String(list.length) })}</summary>
      <ul className="door-list">{list.map((w) => <li key={w} className="muted">{w}</li>)}</ul>
    </details>
  );
}

function ChangeLog({ month }: { month: string }) {
  const t = useT();
  const { locale } = useI18n();
  const log = useLoad(() => fetchScheduleLog(month), `music-log|${month}`);
  if (!log.data || log.data.entries.length === 0) return null;
  return (
    <details className="panel pt-more">
      <summary>{t('door.music.sched.log')}</summary>
      <ul className="door-list">
        {log.data.entries.map((e) => (
          <li key={e.id}>
            <strong>{t(`door.music.sched.action.${e.action}` as 'door.music.sched.action.EDITED')}</strong> · v{e.version} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.at))} · {e.by}
            <br /><span className="muted">{e.summary}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A built draft: confirm it, download it, or throw it away. */
function DraftBody({ id, state, onDone, show, view }: { id: string; state: ScheduleState; onDone: (to?: Tab) => void; show: (e: unknown) => void; view: ScheduleViewKey }) {
  const t = useT();
  const day = useShortDay();
  const monthName = useMonthName();
  const draft = useLoad(() => fetchScheduleDraft(id), `music-draft|${id}`);
  const [live, setLive] = useState<string[]>([]);
  const d = draft.data;
  const open = (d?.months ?? []).filter((m) => m.decided !== 'PUBLISHED').map((m) => m.periodKey);
  const run = async (job: () => Promise<unknown>, to?: Tab) => { try { await job(); onDone(to); } catch (err) { show(err); } };
  const edit: Edit = async (e) => { try { setLive((await editScheduleDraft(id, e)).warnings); draft.reload(); } catch (err) { show(err); } };
  const pdf = () => d && downloadSchedulePdf(`choir-schedule-draft-${d.label}`.replace(/\s+/g, '-'), t('door.sch.pdfTitle', { state: t('door.sch.tab.generated') }), d.label, d.months.map((m) => ({
    heading: monthName(m.periodKey), lines: servicesOfMonth(d.services, m.periodKey).map((s) => `${day(s.date)} · ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}: ${s.units.map((u) => u.name).join(', ') || '-'}`),
  })));
  return (
    <LoadState loading={draft.loading} failed={draft.failed} retry={draft.reload}>
      {d && (
        <>
          <div className="pt-bar">
            <strong>{d.label}</strong>
            <span className="pt-bar-actions">
              <button type="button" className="btn ghost sm" onClick={() => void run(() => discardScheduleDraft(id))}>{t('door.sch.discard')}</button>
              <button type="button" className="btn secondary" onClick={pdf}>{t('door.sch.pdf')}</button>
              <button type="button" className="btn" disabled={open.length === 0} onClick={() => void run(() => confirmScheduleDraft(id, open), 'confirmed')}>{t('door.sch.confirm')}</button>
            </span>
          </div>
          <Notes list={live.length ? live : d.warnings} />
          <Services services={d.services} months={d.months.map((m) => m.periodKey)} units={state.units} edit={edit} view={view} />
        </>
      )}
    </LoadState>
  );
}

/** A confirmed or published month. */
function MonthBody({ month, mode, state, onDone, show, view }: { month: string; mode: 'confirmed' | 'published'; state: ScheduleState; onDone: (to?: Tab) => void; show: (e: unknown) => void; view: ScheduleViewKey }) {
  const t = useT();
  const day = useShortDay();
  const monthName = useMonthName();
  const data = useLoad(() => fetchScheduleMonth(month), `music-month|${month}`);
  const m = data.data;
  const edit: Edit = async (e) => { try { await editScheduleMonth(month, e); data.reload(); onDone(); } catch (err) { show(err); } };
  const pdf = () => m && downloadSchedulePdf(`choir-schedule-${month}`, t('door.sch.pdfTitle', { state: t(`door.sch.tab.${mode}` as 'door.sch.tab.confirmed') }), monthName(month), [{
    heading: monthName(month), lines: m.services.map((s) => `${day(s.date)} · ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}: ${s.units.map((u) => u.name).join(', ') || '-'}`),
  }]);
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {m && (
        <>
          <div className="pt-bar">
            <span><strong>{monthName(month)}</strong> <span className="muted">v{m.version}</span></span>
            <span className="pt-bar-actions">
              <button type="button" className="btn secondary" onClick={pdf}>{t('door.sch.pdf')}</button>
              {mode === 'confirmed' && m.canWrite && <button type="button" className="btn" onClick={async () => { try { await publishScheduleMonths([month]); onDone('published'); } catch (err) { show(err); } }}>{t('door.sch.publish')}</button>}
            </span>
          </div>
          <Notes list={m.warnings} />
          <Services services={m.services} months={[month]} units={state.units} edit={m.canWrite ? edit : undefined} view={view} />
          {m.canWrite && <ChangeLog month={month} />}
        </>
      )}
    </LoadState>
  );
}

/** Music's schedule in three places: generated, confirmed, published. */
export function MonthPlanPage() {
  const t = useT();
  const monthName = useMonthName();
  const state = useLoad(fetchScheduleState, 'music-sched');
  const s = state.data;
  const [tab, setTab] = useState<Tab | null>(null);
  const [picked, setPicked] = useState<Record<Tab, string>>({ generated: '', confirmed: '', published: '' });
  const [view, setView] = useScheduleView();
  const [building, setBuilding] = useState(false);
  const [horizon, setHorizon] = useState<MusicHorizonKey>('MONTH');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const show = (err: unknown) => setError(scheduleErrorText(err) ?? t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const drafts = s?.drafts ?? [];
  const confirmed = (s?.months ?? []).filter((m) => m.state === 'CONFIRMED');
  const published = (s?.months ?? []).filter((m) => m.state === 'PUBLISHED');
  const canWrite = !!s?.canWrite;
  const current: Tab = tab ?? (!canWrite ? 'published' : drafts.length ? 'generated' : confirmed.length ? 'confirmed' : published.length ? 'published' : 'generated');
  const options = s?.options[horizon] ?? [];
  const onDone = (to?: Tab) => { setError(''); state.reload(); if (to) { setTab(to); setPicked({ generated: '', confirmed: '', published: '' }); } };
  const build = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await generateScheduleDraft(horizon, start || options[0]?.value || '');
      state.reload();
      setPicked({ ...picked, generated: r.id });
      setTab('generated');
      setBuilding(false);
    } catch (err) {
      show(err);
    } finally {
      setBusy(false);
    }
  };
  const items: Record<Tab, Array<{ key: string; label: string }>> = {
    generated: drafts.map((d) => ({ key: d.id, label: d.label })),
    confirmed: confirmed.map((m) => ({ key: m.periodKey, label: monthName(m.periodKey) })),
    published: published.map((m) => ({ key: m.periodKey, label: monthName(m.periodKey) })),
  };
  const sel = (k: Tab) => (items[k].some((i) => i.key === picked[k]) ? picked[k] : (items[k][k === 'published' ? items[k].length - 1 : 0]?.key ?? ''));
  const tabs = ([['generated', drafts.length], ['confirmed', confirmed.length], ['published', published.length]] as Array<[Tab, number]>)
    .filter(([k]) => canWrite || k === 'published')
    .map(([k, n]) => ({ key: k, label: t(`door.sch.tab.${k}` as 'door.sch.tab.generated'), count: n }));
  const empty: Record<Tab, string> = { generated: t('door.sch.empty.generated'), confirmed: t('door.sch.empty.confirmed'), published: t('door.sch.empty.published') };
  return (
    <section className="door-block pt-page" aria-labelledby="door-plan-title">
      <PageHeader
        id="door-plan-title"
        title={t('door.own.monthplan')}
        actions={<ViewSwitch value={view} onChange={setView} />}
        primary={canWrite ? <button type="button" className="btn" onClick={() => setBuilding(true)}>{t('door.sch.build')}</button> : undefined}
      />
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={state.loading} failed={state.failed} retry={state.reload}>
        {s && (
          <>
            <Tabs items={tabs} value={current} onChange={setTab} label={t('door.own.monthplan')} />
            {items[current].length === 0 ? (
              <EmptyState title={empty[current]} />
            ) : (
              <>
                <Picker items={items[current]} value={sel(current)} onPick={(k) => setPicked({ ...picked, [current]: k })} />
                {current === 'generated'
                  ? <DraftBody key={sel('generated')} id={sel('generated')} state={s} onDone={onDone} show={show} view={view} />
                  : <MonthBody key={`${current}-${sel(current)}`} month={sel(current)} mode={current} state={s} onDone={onDone} show={show} view={view} />}
              </>
            )}
          </>
        )}
      </LoadState>
      <SidePanel open={building} title={t('door.sch.build')} onClose={() => setBuilding(false)} onSave={() => void build()} saveLabel={busy ? t('door.music.sched.building') : t('door.music.sched.buildNow')} saving={busy}>
        <div className="pt-edit">
          <SelectField label={t('door.music.sched.horizon')} name="g-horizon" value={horizon} onChange={(e) => { setHorizon(e.target.value as MusicHorizonKey); setStart(''); }}>
            {HORIZONS.map((h) => <option key={h} value={h}>{t(`door.music.sched.horizon.${h}` as 'door.music.sched.horizon.MONTH')}</option>)}
          </SelectField>
          <SelectField label={t('door.music.sched.period')} name="g-start" value={start || options[0]?.value || ''} onChange={(e) => setStart(e.target.value)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
        </div>
      </SidePanel>
    </section>
  );
}
