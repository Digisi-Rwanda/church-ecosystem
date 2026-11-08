import { useChoirRegisterRefresh } from './useChoirRegister';
import { Link } from 'react-router-dom';
import { MusicBulletin } from './Bulletins.tsx';
import type { ScheduleRuleContext } from '../api/frontDoorApi';
import { policySummary } from './config';
import { ConfirmDialog, StatusChip } from './kit';
import { useEffect, useState } from 'react';
import {
  publishScheduleDraft, confirmScheduleDraft, discardScheduleDraft, editScheduleDraft, editScheduleMonth, fetchScheduleDraft, fetchScheduleLog, fetchScheduleMonth, fetchScheduleState,
  deleteScheduleMonth, generateScheduleDraft, publishScheduleMonths, type MusicHorizonKey, type ScheduleEdit, type ScheduleMonthView, type ScheduleService, type ScheduleState,
} from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { addableUnits, musicErrorKey, scheduleErrorText, servicesOfMonth } from './music';
import { addMonths, thisMonth } from './schedule';
import { DateTile, ScheduleList, ViewSwitch, useMonthName, useScheduleView, useShortDay, type ScheduleRow, type ScheduleViewKey } from './ScheduleShared';
import { downloadSchedulePdf, printNamedSheet } from './schedulePdf';
import { musicPdfFilename } from './bulletins';
import { useLoad } from './useLoad';
import { EmptyState, PageHeader, SidePanel, Tabs } from './kit';

const HORIZONS: MusicHorizonKey[] = ['MONTH', 'QUARTER', 'HALF', 'YEAR'];
type Tab = 'generated' | 'confirmed' | 'published' | 'history';
type Units = ScheduleState['units'];
type Edit = (e: ScheduleEdit) => Promise<unknown>;

/** One service: the date, the kind and the choirs on it. Edit opens a side panel. */
function ServiceCard({ svc, onEdit }: { svc: ScheduleService; onEdit?: () => void }) {
  const t = useT();
  return (
    <li className="pt-card">
      <div className="pt-card-head">
        <DateTile date={svc.date} />
        <div className="pt-card-title"><strong>{svc.label}</strong></div>
      </div>
      {svc.units.length === 0 ? (
        <p className="muted">{t('door.music.noChoirYet')}</p>
      ) : (
        <ul className="pt-people">
          {svc.units.map((u) => (
            <li key={u.unitId} className="pt-person">
              <span className="pt-avatar" aria-hidden>{u.name.slice(0, 2).toUpperCase()}</span>
              <span className="pt-name">{u.name}</span>
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
  const [pending,setPending]=useState(false), [error,setError]=useState('');
  const runEdit = async (change: ScheduleEdit) => { if (pending) return; setPending(true); setError(''); try { await edit(change); } catch(reason) { setError(scheduleErrorText(reason) ?? t(musicErrorKey(errorCode(reason)) as 'door.people.actionFailed')); } finally {setPending(false);} };
  const free = addableUnits(units, svc);
  return (
    <SidePanel open title={`${day(svc.date)} · ${svc.label}`} onClose={onClose}>
      <div className="pt-edit">{error && <p className="door-error" role="alert">{error}</p>}<fieldset className="scheduling-workspace-actions" disabled={pending} aria-busy={pending}>
        <ul className="pt-edit-list">
          {svc.units.map((u) => {
            const swaps = free;
            return (
              <li key={u.unitId} className="pt-edit-row">
                <span className="pt-avatar" aria-hidden>{u.name.slice(0, 2).toUpperCase()}</span>
                <span className="pt-edit-name"><strong>{u.name}</strong></span>
                {swaps.length > 0 && (
                  <SelectField label={t('door.music.sched.replaceWith')} name={`r-${svc.id}-${u.unitId}`} value="" onChange={(e) => e.target.value && void runEdit({ serviceId: svc.id, action: 'replace', unitId: u.unitId, toUnitId: e.target.value })}>
                    <option value="">{t('door.gov.meeting.choose')}</option>
                    {swaps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </SelectField>
                )}
                <button type="button" className="btn ghost sm" onClick={() => void runEdit({ serviceId: svc.id, action: 'remove', unitId: u.unitId })}>{t('door.groups.remove')}</button>
              </li>
            );
          })}
        </ul>
        {free.length > 0 && (
          <SelectField label={t('door.music.addChoir')} name={`a-${svc.id}`} value="" onChange={(e) => e.target.value && void runEdit({ serviceId: svc.id, action: 'add', unitId: e.target.value })}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </SelectField>
        )}
        <button type="button" className="btn" onClick={onClose}>{t('door.protocol.panel.done')}</button>
      </fieldset></div>
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
    id: s.id, date: s.date, title: s.label, names: s.units.map((u) => ({ name: u.name })),
    onEdit: edit && s.musicRequired !== false ? () => setEditing(s.id) : undefined,
  }));
  return (
    <>
      {view === 'bulletin' && months.map(month => <MusicBulletin key={month} month={month}
        onEdit={edit ? setEditing : undefined} editLabel={t('door.sch.edit')}
        services={servicesOfMonth(services, month).map(s => ({
          id: s.id, date: s.date, kind: s.kind, label: s.label, names: s.units.map(u => u.name), editable: s.musicRequired !== false,
        }))} />)}
      {view === 'list' && <ScheduleList rows={rows} />}
      {view === 'cards' && months.map((m) => (
        <div key={m} className="pt-month-block">
          {months.length > 1 && <h3>{monthName(m)}</h3>}
          <ul className="pt-grid">
            {servicesOfMonth(services, m).map((s) => <ServiceCard key={s.id} svc={s} onEdit={edit && s.musicRequired !== false ? () => setEditing(s.id) : undefined} />)}
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
            <strong>{t(`door.music.sched.action.${e.action}` as 'door.music.sched.action.EDITED')}</strong> � v{e.version} � {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.at))} � {e.by}
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
  useChoirRegisterRefresh(draft.reload);
  const [pending, setPending] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const d = draft.data;
  const open = (d?.months ?? []).filter((m) => m.decided !== 'PUBLISHED').map((m) => m.periodKey);
  const run = async (job: () => Promise<unknown>, to?: Tab) => { if (pending) return; setPending(true); try { await job(); onDone(to); } catch (err) { show(err); } finally { setPending(false); } };
  const edit: Edit = async (e) => { try { setLive((await editScheduleDraft(id, e)).warnings); draft.reload(); } catch (err) { show(err); throw err; } };
  const pdf = () => {
    if (!d) return;
    if (view === 'bulletin') {
      printNamedSheet(d.months[0] ? musicPdfFilename(d.months[0].periodKey) : `Choir_Schedule_${d.label.replace(/\s+/g, '_')}.pdf`);
      return;
    }
    downloadSchedulePdf(`choir-schedule-draft-${d.label}`.replace(/\s+/g, '-'), t('door.sch.pdfTitle', { state: t('door.sch.tab.generated') }), d.label, d.months.map((m) => ({
      heading: monthName(m.periodKey), lines: servicesOfMonth(d.services, m.periodKey).map((s) => `${day(s.date)} � ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}: ${s.units.map((u) => u.name).join(', ') || '-'}`),
    })));
  };
  return (
    <LoadState loading={draft.loading} failed={draft.failed} retry={draft.reload}>
      {d && (
        <>
          <div className="pt-bar">
            <strong>{d.label}</strong>
            <span className="pt-bar-actions">
              <button type="button" className="btn ghost sm" onClick={() => void run(() => discardScheduleDraft(id))}>{t('door.sch.discard')}</button>
              <button type="button" className="btn secondary" onClick={pdf}>{t('door.sch.pdf')}</button>
              <button type="button" className="btn" disabled={pending || open.length === 0 || d.validation?.ok === false} onClick={() => void run(() => confirmScheduleDraft(id, open), 'confirmed')}>{t('door.sch.confirm')}</button>
            </span>
          </div>
          <RuleContext value={d} />
          {d.months.some(m=>m.decided === "PUBLISHED") && <><p className="muted">{t("door.scheduling.replaceHelp")}</p><button className="btn secondary" disabled={pending || d.validation?.ok === false} onClick={()=>setReplacing(true)}>{t("door.scheduling.replace")}</button><ConfirmDialog open={replacing} title={t("door.scheduling.replace")} body={t("door.scheduling.replaceHelp")} busy={pending} onCancel={()=>setReplacing(false)} onConfirm={()=>void run(()=>publishScheduleDraft(id), "published")} /></>}
          <Notes list={live.length ? live : d.warnings} />
          <Services services={d.services} months={d.months.map((m) => m.periodKey)} units={state.units} edit={edit} view={view} />
        </>
      )}
    </LoadState>
  );
}

/** A confirmed or published month. */
function MonthBody({ month, mode, state, onDone, show, view, readOnly = false }: { month: string; mode: 'confirmed' | 'published'; state: ScheduleState; onDone: (to?: Tab) => void; show: (e: unknown) => void; view: ScheduleViewKey; readOnly?: boolean }) {
  const t = useT();
  const day = useShortDay();
  const monthName = useMonthName();
  const data = useLoad(() => fetchScheduleMonth(month), `music-month|${month}`);
  const [deleting, setDeleting] = useState<Pick<ScheduleMonthView, 'state' | 'version'> | null>(null);
  const [busy, setBusy] = useState(false);
  useChoirRegisterRefresh(data.reload);
  const m = data.data;
  const canEdit = m?.canWrite && !readOnly;
  const remove = async () => {
    if (busy || !deleting) return;
    setBusy(true);
    try {
      await deleteScheduleMonth(month, deleting);
      onDone();
    } catch (err) {
      show(err);
      data.reload();
    } finally {
      setDeleting(null);
      setBusy(false);
    }
  };
  const edit: Edit = async (e) => { try { await editScheduleMonth(month, e); data.reload(); onDone(); } catch (err) { show(err); throw err; } };
  const pdf = () => {
    if (!m) return;
    if (view === 'bulletin') {
      printNamedSheet(musicPdfFilename(month));
      return;
    }
    downloadSchedulePdf(`choir-schedule-${month}`, t('door.sch.pdfTitle', { state: t(`door.sch.tab.${mode}` as 'door.sch.tab.confirmed') }), monthName(month), [{
      heading: monthName(month), lines: m.services.map((s) => `${day(s.date)} � ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}: ${s.units.map((u) => u.name).join(', ') || '-'}`),
    }]);
  };
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {m && (
        <>
          <div className="pt-bar">
            <span><strong>{monthName(month)}</strong> <span className="muted">v{m.version}</span></span>
            <span className="pt-bar-actions">
              <button type="button" className="btn secondary" onClick={pdf}>{t('door.sch.pdf')}</button>
              {mode === 'confirmed' && m.state === 'CONFIRMED' && canEdit && <button disabled={busy || m.validation?.ok === false} type="button" className="btn" onClick={async () => {
                setBusy(true);
                try { await publishScheduleMonths([month]); onDone('published'); } catch (err) { show(err); } finally { setBusy(false); }
              }}>{t('door.sch.publish')}</button>}
              {canEdit && <button type="button" className="btn ghost" disabled={busy}
                onClick={() => setDeleting({ state: m.state, version: m.version })}>{t('door.sch.deleteSchedule')}</button>}
            </span>
          </div>
          <StatusChip>{t("door.scheduling.savedState", { state: t(mode === "published" ? "door.sch.tab.published" : "door.sch.tab.confirmed") })}</StatusChip>
          {m.canWrite && <RuleContext value={m} />}
          <Notes list={m.warnings} />
          <Services services={m.services} months={[month]} units={state.units} edit={canEdit ? edit : undefined} view={view} />
          {m.canWrite && <ChangeLog month={month} />}
          <ConfirmDialog open={!!deleting} busy={busy} danger title={t('door.sch.deleteSchedule')}
            body={t(deleting?.state === 'PUBLISHED' ? 'door.sch.deletePublished' : 'door.sch.deleteConfirmed', { month: monthName(month) })}
            confirmLabel={t('door.sch.deleteSchedule')} onConfirm={() => void remove()} onCancel={() => { if (!busy) setDeleting(null); }} />
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
  useChoirRegisterRefresh(state.reload);
  const s = state.data;
  const [tab, setTab] = useState<Tab | null>(null);
  const [picked, setPicked] = useState<Record<Tab, string>>({ generated: '', confirmed: '', published: '', history: '' });
  const [view, setView] = useScheduleView();
  const [building, setBuilding] = useState(false);
  const [horizon, setHorizon] = useState<MusicHorizonKey>('MONTH');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentMonth, setCurrentMonth] = useState(() => thisMonth());
  const reloadSchedule = state.reload;
  useEffect(() => {
    const refresh = () => {
      const month = thisMonth();
      if (month === currentMonth) return;
      setCurrentMonth(month);
      reloadSchedule();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [currentMonth, reloadSchedule]);
  const show = (err: unknown) => setError(scheduleErrorText(err) ?? t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const drafts = s?.drafts ?? [];
  const upcoming = [currentMonth, addMonths(currentMonth, 1)];
  const confirmed = (s?.months ?? []).filter((m) => m.state === 'CONFIRMED' && upcoming.includes(m.periodKey));
  const published = (s?.months ?? []).filter((m) => m.state === 'PUBLISHED' && upcoming.includes(m.periodKey));
  const archived = (s?.months ?? []).filter((m) => m.periodKey < currentMonth);
  const canWrite = !!s?.canWrite;
  const current: Tab = tab ?? (!canWrite ? 'published' : drafts.length ? 'generated' : confirmed.length ? 'confirmed' : published.length ? 'published' : 'generated');
  const options = s?.options[horizon] ?? [];
  const onDone = (to?: Tab) => { setError(''); state.reload(); if (to) { setTab(to); setPicked({ generated: '', confirmed: '', published: '', history: picked.history }); } };
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
    confirmed: upcoming.map((key) => ({ key, label: monthName(key) })),
    published: upcoming.map((key) => ({ key, label: monthName(key) })),
    history: archived.map((m) => ({ key: m.periodKey, label: monthName(m.periodKey) })),
  };
  const sel = (k: Tab) => items[k].some((i) => i.key === picked[k]) ? picked[k] : (items[k][0]?.key ?? '');
  const hasSchedule = current === 'generated' || (current === 'confirmed' ? confirmed : published).some((m) => m.periodKey === sel(current));
  const tabs = ([['generated', drafts.length], ['confirmed', confirmed.length], ['published', published.length], ['history', archived.length]] as Array<[Tab, number]>)
    .filter(([k]) => canWrite || k === 'published' || k === 'history')
    .map(([k, n]) => ({ key: k, label: t(`door.sch.tab.${k}`), count: n }));
  const empty: Record<Tab, string> = { generated: t('door.sch.empty.generated'), confirmed: t('door.sch.empty.confirmed'), published: t('door.sch.empty.published'), history: t('door.sch.empty.history') };
  const archivedMonth = archived.find((m) => m.periodKey === sel('history'));
  return (
    <section className="door-block pt-page" aria-labelledby="door-plan-title">
      <PageHeader
        id="door-plan-title"
        title={t('door.own.monthplan')}
        actions={<ViewSwitch value={view} onChange={setView} />}
        primary={canWrite ? <button type="button" className="btn" onClick={() => setBuilding(true)}>{t('door.sch.build')}</button> : undefined}
      />
      {canWrite && <p className="muted">{t("door.scheduling.workflow")} <Link to="/s/sys-music/config">{t("door.scheduling.setup")}</Link></p>}
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={state.loading} failed={state.failed} retry={state.reload}>
        {s && (
          <>
            <Tabs items={tabs} value={current} onChange={setTab} label={t('door.own.monthplan')} />
            {current === 'history' && archivedMonth ? (
              <>
                <SelectField label={t('door.sch.historyMonth')} name="history-month" value={archivedMonth.periodKey} onChange={(e) => setPicked({ ...picked, history: e.target.value })}>
                  {items.history.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </SelectField>
                <MonthBody key={`history-${archivedMonth.periodKey}`} month={archivedMonth.periodKey} mode={archivedMonth.state === 'PUBLISHED' ? 'published' : 'confirmed'} state={s} onDone={onDone} show={show} view={view} readOnly />
              </>
            ) : current === 'history' || items[current].length === 0 ? (
              <EmptyState title={empty[current]} />
            ) : (
              <>
                <Picker items={items[current]} value={sel(current)} onPick={(k) => setPicked({ ...picked, [current]: k })} />
                {current === 'generated'
                  ? <DraftBody key={sel('generated')} id={sel('generated')} state={s} onDone={onDone} show={show} view={view} />
                  : hasSchedule
                    ? <MonthBody key={`${current}-${sel(current)}`} month={sel(current)} mode={current} state={s} onDone={onDone} show={show} view={view} />
                    : <EmptyState title={empty[current]} />}
              </>
            )}
          </>
        )}
      </LoadState>
      <SidePanel open={building} title={t('door.sch.build')} onClose={() => setBuilding(false)} onSave={() => void build()} saveLabel={busy ? t('door.music.sched.building') : t('door.music.sched.buildNow')} saving={busy}>
        <div className="pt-edit">
          <p className="muted" role="note">{t('door.scheduling.generateNote')}</p>
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

function RuleContext({ value }: { value: ScheduleRuleContext }) {
  const t = useT();
  return <details className="panel pt-more"><summary>{t('door.scheduling.rules')}</summary>
    <p>{t('door.scheduling.manual')}</p>
    {value.validation?.reason && <p className="door-error" role="alert">{value.validation.reason}</p>}
    {value.rules?.length ? <ul className="door-list">{value.rules.filter(row=>row.active).map(row=><li key={row.id}><strong>{row.categoryName} · {row.serviceCode}</strong><p className="muted">{policySummary(row,t)}</p></li>)}</ul> : <p className="muted">{t('door.scheduling.noContext')}</p>}
  </details>;
}
