/**
 * Scheduling configuration editors.
 *
 * Music setup is FOUR sections: Services, Choir categories, Choirs, Rules. A Rule is the only scheduling
 * concept a person sees ("For [services], [target] is scheduled [how]"). The tables behind it (policies, choir
 * links, overrides, fixed designations) are handled by the server; nothing here names them.
 * Protocol keeps its own two editors (team rules, duty limits).
 *
 * Configuration is live: every save applies at once and is picked up by the next generate call.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { preserveRelaxableKinds, schedulingError } from './schedulingForms';
import { SchedulingSetupContext } from './SchedulingSetupContext';
import { ApiError } from '../api/client';
import {
  addMusicAvailability,
  createChoirCategory,
  createMusicRule,
  createProtocolDutyPolicy,
  createProtocolServiceRule,
  createSchedulingService,
  deleteMusicRule,
  fetchChoirCategories,
  fetchConfigChoirs,
  fetchMusicAvailability,
  fetchMusicRules,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  removeMusicAvailability,
  retireSchedulingService,
  setChoirCategory,
  updateChoirCategory,
  updateMusicRule,
  updateProtocolDutyPolicy,
  updateProtocolServiceRule,
  updateSchedulingService,
  type ChoirCategoryApi,
  type MusicRuleApi,
  type MusicRuleInputApi,
  type PlanningMode,
  type ProtocolServiceRuleApi,
  type RuleFrequencyApi,
  type SchedulingServiceApi,
} from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import {
  extraDutyPolicyName,
  formatFrequency,
  formatMinMax,
  recurrenceKey,
  ruleSentences,
  serviceKindKey,
  type RuleNames,
} from './config';
import { ConfirmDialog, EmptyState, SidePanel, StatusChip } from './kit';
import './schedulingConfig.css';

type Arrangement = PlanningMode;

/** canWrite means: the person may edit AND holds the edit lock (the page works that out). */
type Props = {
  systemId: string;
  canWrite: boolean;
};

type SaveState = {
  error: string;
  saved: boolean;
  working: boolean;
  run: (save: () => Promise<unknown>, reload: () => void) => Promise<boolean>;
  clear: () => void;
  fail: (reason: unknown) => void;
};

function useSaveState(): SaveState {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);
  return {
    error, saved, working,
    clear: () => { setError(""); setSaved(false); },
    fail: (reason) => setError(schedulingError(reason) ?? (reason instanceof Error && reason.message ? reason.message : t("door.config.err.input"))),
    run: async (save, reload) => {
      setError("");
      setSaved(false);
      setWorking(true);
      try {
        await save();
        setup.saved();
        reload();
        setSaved(true);
        return true;
      } catch (reason) {
        setError(schedulingError(reason) ?? (reason instanceof Error && reason.message ? reason.message : t("door.config.err.server")));
        return false;
      } finally {
        setWorking(false);
      }
    },
  };
}

function FormNotice({ state }: { state: SaveState }) {
  const t = useT();
  return (
    <>
      {state.error && <p className="door-error" role="alert">{state.error}</p>}
      {state.saved && <p className="muted" role="status">{t("door.config.saved")}</p>}
    </>
  );
}

function EditToggle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" className="btn ghost sm" onClick={onClick}>{t("door.settings.edit")}</button>;
}

function AddToggle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" className="btn sm" onClick={onClick}>{t("door.config.add")}</button>;
}

function SubmitButtons({ working, onCancel }: { editing: boolean; working: boolean; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="door-row">
      <button type="submit" className="btn sm" disabled={working}>{t("door.settings.save")}</button>
      <button type="button" className="btn ghost sm" disabled={working} onClick={onCancel}>{t("door.settings.cancel")}</button>
    </div>
  );
}

function TextField({ label, name, value, required = false, type = "text", min, max, pattern }: {
  label: string; name: string; value?: string | number; required?: boolean; type?: string;
  min?: number; max?: number; pattern?: string;
}) {
  return (
    <label>{label}
      <input name={name} type={type} defaultValue={value ?? ""} required={required}
        min={min} max={max} pattern={pattern} />
    </label>
  );
}

function SelectField({ label, name, value, options, required = false }: {
  label: string; name: string; value?: string; options: Array<{ value: string; label: string }>; required?: boolean;
}) {
  return (
    <label>{label}
      <select name={name} defaultValue={value ?? options[0]?.value ?? ""} required={required}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, name, checked = false, value }: { label: string; name: string; checked?: boolean; value?: string }) {
  return <label><input name={name} type="checkbox" value={value} defaultChecked={checked} /> {label}</label>;
}

function readForm(form: HTMLFormElement): FormData {
  return new FormData(form);
}
const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string, emptyValue: number | null = null) => {
  const value = str(data, key);
  return value === "" ? emptyValue : Number(value);
};
const flag = (data: FormData, key: string) => data.has(key) && data.get(key) !== 'no';
function SaveForm({ title, state, children, onSubmit, editing, working, onCancel }: {
  title: string; state: SaveState; children: ReactNode; onSubmit: (data: FormData) => Promise<void>;
  editing: boolean; working: boolean; onCancel: () => void;
}) {
  const setup = useContext(SchedulingSetupContext);
  return (
    <form className="panel door-form" onSubmit={(event) => {
      event.preventDefault();
      void onSubmit(readForm(event.currentTarget)).catch(state.fail);
    }}>
      <h3>{title}</h3>
      {children}
      <SubmitButtons editing={editing} working={working} onCancel={() => { setup.saved(); onCancel(); }} />
    </form>
  );
}

function EmptyOrLocked({ canEdit, empty, emptyKey }: { canEdit: boolean; empty: boolean; emptyKey: Parameters<ReturnType<typeof useT>>[0] }) {
  const t = useT();
  if (!empty) return null;
  return <p className="muted">{canEdit ? t("door.config.emptyDraft") : t(emptyKey)}</p>;
}

function Pill({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={`scheduling-pill ${on ? 'is-on' : 'is-off'}`}>{children}</span>;
}

function SectionNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return <p className={`scheduling-config-notice${tone === "warn" ? " is-warning" : ""}`}>{children}</p>;
}

function TeamSizeOverridesField({ overrides }: { overrides: Record<string, number> }) {
  const t = useT();
  const [rows, setRows] = useState(() => Object.entries(overrides).map(([date, size]) => ({ date, size: String(size) })));
  return (
    <fieldset className="scheduling-config-overrides">
      <legend>{t("door.config.protocol.teamSizeOverrides")}</legend>
      <p className="muted">{t("door.config.protocol.teamSizeOverridesHelp")}</p>
      {rows.map((row, index) => (
        <div className="scheduling-config-override-row" key={`${row.date}-${index}`}>
          <label>{t("door.config.override.date")}
            <input name="overrideDate" type="date" defaultValue={row.date} />
          </label>
          <label>{t("door.config.override.size")}
            <input name="overrideSize" type="number" min={1} step={1} required defaultValue={row.size} />
          </label>
          <button type="button" className="btn ghost sm"
            aria-label={t("door.config.override.remove", { number: index + 1 })}
            onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
            {t("door.config.override.removeAction")}
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm"
        onClick={() => setRows((current) => [...current, { date: "", size: "10" }])}>
        {t("door.config.override.add")}
      </button>
    </fieldset>
  );
}

/* ───────────────────────── The four Music sections ───────────────────────── */

type Tn = ReturnType<typeof useT>;
const dayName = (t: Tn, weekday: number | null) => weekday === null || weekday === undefined ? '' : t(`door.caring.weekday.${weekday}` as Parameters<Tn>[0]);
/** "Sunday 1st · Sunday 08:00": the weekday goes in the label so two services with the same name stay apart. */
const serviceLabel = (t: Tn, s: SchedulingServiceApi) => [s.name, [dayName(t, s.weekday), s.time].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

function useConfirmDelete() {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  return { target, ask: (id: string, name: string) => setTarget({ id, name }), close: () => setTarget(null) };
}

/** Table cell input helpers for the inline editors. */
function useDraft<T extends object>(initial: T) {
  const setup = useContext(SchedulingSetupContext);
  const [draft, setDraft] = useState<T>(initial);
  return { draft, set: (patch: Partial<T>) => { setDraft((d) => ({ ...d, ...patch })); setup.changed(); } };
}

/* ── 1. Services ── */

type ServiceDraft = {
  name: string; code: string; weekday: string; time: string; recurrence: string; musicRequired: boolean; protocolRequired: boolean;
  active: boolean; kind: string; maxChoirs: string; displayOrder: string; selectedDates: string;
};
const serviceDraft = (s: SchedulingServiceApi | null): ServiceDraft => ({
  name: s?.name ?? '', code: s?.code ?? '', weekday: s?.weekday == null ? '' : String(s.weekday), time: s?.time ?? '',
  recurrence: s?.recurrence ?? 'WEEKLY', musicRequired: s?.musicRequired ?? true, protocolRequired: s?.protocolRequired ?? true,
  active: s?.active ?? true, kind: s?.kind ?? 'SERVICE', maxChoirs: String(s?.maxChoirs ?? 3), displayOrder: String(s?.displayOrder ?? 0),
  selectedDates: (s?.selectedDates ?? []).join('\n'),
});

function ServiceEditRow({ row, state, onDone, onSaved }: { row: SchedulingServiceApi | null; state: SaveState; onDone: () => void; onSaved: () => void }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft(serviceDraft(row));
  const save = async () => {
    const patch = {
      code: draft.code.trim() || `SERVICE_${crypto.randomUUID().slice(0, 8)}`, name: draft.name.trim(), kind: draft.kind,
      weekday: draft.weekday === '' ? null : Number(draft.weekday), time: draft.time || null, recurrence: draft.recurrence,
      selectedDates: draft.selectedDates.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean),
      active: draft.active, musicRequired: draft.musicRequired, protocolRequired: draft.protocolRequired,
      maxChoirs: Number(draft.maxChoirs || 3), displayOrder: Number(draft.displayOrder || 0),
    };
    const ok = await state.run(() => row ? updateSchedulingService(row.id, patch) : createSchedulingService({ ...patch, systemId: 'sys-music' }), onSaved);
    if (ok) onDone();
  };
  const field = (label: string) => ({ 'aria-label': label });
  return <>
    <tr className="is-editing">
      <td><input {...field(t('door.config.service.name'))} value={draft.name} required onChange={(e) => set({ name: e.target.value })} /></td>
      <td><input {...field(t('door.config.service.code'))} value={draft.code} pattern="[A-Za-z0-9_-]{1,40}" onChange={(e) => set({ code: e.target.value })} /></td>
      <td><select {...field(t('door.config.service.weekday'))} value={draft.weekday} onChange={(e) => set({ weekday: e.target.value })}>
        <option value="">{t('door.config.form.any')}</option>
        {Array.from({ length: 7 }, (_, day) => <option key={day} value={day}>{dayName(t, day)}</option>)}
      </select></td>
      <td><input {...field(t('door.config.service.time'))} type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} /></td>
      <td><select {...field(t('door.config.service.recurrence'))} value={draft.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
        {['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM'].map((r) => <option key={r} value={r}>{t(recurrenceKey(r as SchedulingServiceApi['recurrence']))}</option>)}
      </select></td>
      <td><input type="checkbox" {...field(t('door.config.service.music'))} checked={draft.musicRequired} onChange={(e) => set({ musicRequired: e.target.checked })} /></td>
      <td><input type="checkbox" {...field(t('door.config.service.protocol'))} checked={draft.protocolRequired} onChange={(e) => set({ protocolRequired: e.target.checked })} /></td>
      <td><input type="checkbox" {...field(t('door.config.service.active'))} checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /></td>
      <td className="scheduling-table-actions">
        <button type="button" className="btn sm" disabled={state.working || !draft.name.trim()} onClick={() => void save()}>{t('door.settings.save')}</button>
        <button type="button" className="btn ghost sm" disabled={state.working} onClick={() => { setup.saved(); onDone(); }}>{t('door.settings.cancel')}</button>
      </td>
    </tr>
    <tr className="is-editing"><td colSpan={9}>
      <details className="scheduling-config-advanced" open={draft.recurrence === 'SELECTED_DATES' || draft.recurrence === 'CUSTOM' || !!draft.selectedDates}>
        <summary>{t('door.config.help.advancedService')}</summary>
        <div className="door-form">
          <label>{t('door.config.service.kind')}<select value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
            {['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER'].map((k) => <option key={k} value={k}>{t(serviceKindKey(k as SchedulingServiceApi['kind']))}</option>)}
          </select></label>
          <label>{t('door.config.service.capacity')}<input type="number" min={0} value={draft.maxChoirs} onChange={(e) => set({ maxChoirs: e.target.value })} /></label>
          <label>{t('door.config.service.order')}<input type="number" min={0} value={draft.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} /></label>
          <label>{t('door.config.service.dates')}<textarea rows={3} value={draft.selectedDates} onChange={(e) => set({ selectedDates: e.target.value })} placeholder="2026-12-25" /></label>
        </div>
      </details>
    </td></tr>
  </>;
}

export function ServicesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const isMusic = systemId === 'sys-music';
  const editable = canWrite && isMusic;
  const list = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-services|${systemId}`);
  const state = useSaveState();
  const ask = useConfirmDelete();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const rows = list.data?.services ?? [];
  const yes = (v: boolean) => <Pill on={v}>{v ? t('door.config.form.yes') : t('door.config.form.no')}</Pill>;
  return <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
    {!isMusic && <SectionNotice>{t('door.config.sharedCalendarReadOnly')}</SectionNotice>}
    <FormNotice state={state} />
    {editable && editing === null && <button type="button" className="btn sm" onClick={() => { state.clear(); setEditing('new'); }}>{t('door.config.add')}</button>}
    <div className="scheduling-table-scroll"><table className="scheduling-table">
      <thead><tr>
        <th>{t('door.config.col.name')}</th><th>{t('door.config.col.code')}</th><th>{t('door.config.col.weekday')}</th><th>{t('door.config.col.time')}</th>
        <th>{t('door.config.col.recurrence')}</th><th>{t('door.config.col.music')}</th><th>{t('door.config.col.protocol')}</th><th>{t('door.config.col.active')}</th><th />
      </tr></thead>
      <tbody>
        {editing === 'new' && <ServiceEditRow row={null} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />}
        {rows.map((s) => editing === s.id
          ? <ServiceEditRow key={s.id} row={s} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />
          : <tr key={s.id} className={s.active ? undefined : 'is-inactive'}>
            <td>{s.name}</td><td>{s.code}</td><td>{dayName(t, s.weekday) || t('door.config.form.any')}</td><td>{s.time ?? '—'}</td>
            <td>{t(recurrenceKey(s.recurrence))}</td><td>{yes(s.musicRequired)}</td><td>{yes(s.protocolRequired)}</td>
            <td><Pill on={s.active}>{s.active ? t('door.config.service.active') : t('door.config.service.inactive')}</Pill></td>
            <td className="scheduling-table-actions">{editable && editing === null && <>
              <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setEditing(s.id); }}>{t('door.settings.edit')}</button>
              {s.active && <button type="button" className="btn ghost sm" onClick={() => ask.ask(s.id, s.name)}>{t('door.config.delete')}</button>}
            </>}</td>
          </tr>)}
      </tbody>
    </table></div>
    {rows.length === 0 && editing === null && <p className="muted">{editable ? t('door.config.emptyDraft') : t('door.config.services.empty')}</p>}
    <ConfirmDialog open={!!ask.target} busy={state.working} title={t('door.config.deleteService.title', { name: ask.target?.name ?? '' })}
      body={t('door.config.deleteService.body')} confirmLabel={t('door.config.delete')}
      onCancel={ask.close} onConfirm={() => { const id = ask.target?.id; ask.close(); if (id) void state.run(() => retireSchedulingService(id), list.reload); }} />
  </LoadState>;
}

/* ── 2. Choir categories ── */

function CategoryEditRow({ row, state, onDone, onSaved }: { row: ChoirCategoryApi | null; state: SaveState; onDone: () => void; onSaved: () => void }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft({ name: row?.name ?? '', code: row?.code ?? '', active: row?.active ?? true });
  const save = async () => {
    const patch = { name: draft.name.trim(), code: draft.code.trim() || draft.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40), description: row?.description ?? '', active: draft.active };
    const ok = await state.run(() => row ? updateChoirCategory(row.id, patch) : createChoirCategory({ ...patch, systemId: 'sys-music' }), onSaved);
    if (ok) onDone();
  };
  return <tr className="is-editing">
    <td><input aria-label={t('door.config.category.name')} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></td>
    <td><input aria-label={t('door.config.category.code')} value={draft.code} pattern="[A-Za-z0-9_-]{1,40}" onChange={(e) => set({ code: e.target.value })} /></td>
    <td><input type="checkbox" aria-label={t('door.config.service.active')} checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /></td>
    <td className="scheduling-table-actions">
      <button type="button" className="btn sm" disabled={state.working || !draft.name.trim()} onClick={() => void save()}>{t('door.settings.save')}</button>
      <button type="button" className="btn ghost sm" disabled={state.working} onClick={() => { setup.saved(); onDone(); }}>{t('door.settings.cancel')}</button>
    </td>
  </tr>;
}

export function CategoriesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === 'sys-music';
  const list = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const state = useSaveState();
  const ask = useConfirmDelete();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const rows = list.data?.categories ?? [];
  return <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
    <FormNotice state={state} />
    {editable && editing === null && <button type="button" className="btn sm" onClick={() => { state.clear(); setEditing('new'); }}>{t('door.config.add')}</button>}
    <div className="scheduling-table-scroll"><table className="scheduling-table">
      <thead><tr><th>{t('door.config.col.name')}</th><th>{t('door.config.col.code')}</th><th>{t('door.config.col.active')}</th><th /></tr></thead>
      <tbody>
        {editing === 'new' && <CategoryEditRow row={null} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />}
        {rows.map((c) => editing === c.id
          ? <CategoryEditRow key={c.id} row={c} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />
          : <tr key={c.id} className={c.active ? undefined : 'is-inactive'}>
            <td>{c.name}</td><td>{c.code}</td><td><Pill on={c.active}>{c.active ? t('door.config.service.active') : t('door.config.service.inactive')}</Pill></td>
            <td className="scheduling-table-actions">{editable && editing === null && <>
              <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setEditing(c.id); }}>{t('door.settings.edit')}</button>
              {c.active && <button type="button" className="btn ghost sm" onClick={() => ask.ask(c.id, c.name)}>{t('door.config.delete')}</button>}
            </>}</td>
          </tr>)}
      </tbody>
    </table></div>
    {rows.length === 0 && editing === null && <p className="muted">{editable ? t('door.config.emptyDraft') : t('door.config.categories.empty')}</p>}
    <ConfirmDialog open={!!ask.target} busy={state.working} title={t('door.config.deleteCategory.title', { name: ask.target?.name ?? '' })}
      body={t('door.config.deleteCategory.body')} confirmLabel={t('door.config.delete')}
      onCancel={ask.close} onConfirm={() => { const id = ask.target?.id; ask.close(); if (id) void state.run(() => updateChoirCategory(id, { active: false }), list.reload); }} />
  </LoadState>;
}

/* ── 3. Choirs (one category per choir) ── */

export function ChoirsEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const editable = canWrite && systemId === 'sys-music';
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const cats = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const state = useSaveState();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const categories = cats.data?.categories ?? [];
  const rows = choirs.data?.choirs ?? [];
  return <LoadState loading={choirs.loading || cats.loading} failed={choirs.failed || cats.failed} retry={() => { choirs.reload(); cats.reload(); }}>
    <FormNotice state={state} />
    <div className="scheduling-table-scroll"><table className="scheduling-table">
      <thead><tr><th>{t('door.config.col.choir')}</th><th>{t('door.config.col.category')}</th><th>{t('door.config.col.active')}</th><th /></tr></thead>
      <tbody>
        {rows.map((c) => {
          const value = picked[c.id] ?? c.categoryId ?? '';
          const dirty = value !== (c.categoryId ?? '') && value !== '';
          return <tr key={c.id} className={c.active ? undefined : 'is-inactive'}>
            <td>{c.name}</td>
            <td>
              <select aria-label={t('door.config.col.category')} value={value} disabled={!editable || !c.active}
                onChange={(e) => { setPicked({ ...picked, [c.id]: e.target.value }); setup.changed(); }}>
                {!c.categoryId && <option value="">{t('door.config.choir.unassigned')}</option>}
                {categories.filter((k) => k.active || k.id === c.categoryId).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              {!c.categoryId && c.active && <StatusChip tone="warn">{t('door.config.choir.unassigned')}</StatusChip>}
            </td>
            <td><Pill on={c.active}>{c.active ? t('door.config.service.active') : t('door.config.service.inactive')}</Pill></td>
            <td className="scheduling-table-actions">{editable && dirty && <>
              <button type="button" className="btn sm" disabled={state.working}
                onClick={() => void state.run(() => setChoirCategory(c.id, value), choirs.reload).then((ok) => { if (ok) setPicked(({ [c.id]: _gone, ...rest }) => rest); })}>{t('door.settings.save')}</button>
              <button type="button" className="btn ghost sm" disabled={state.working}
                onClick={() => { setPicked(({ [c.id]: _gone, ...rest }) => rest); setup.saved(); }}>{t('door.settings.cancel')}</button>
            </>}</td>
          </tr>;
        })}
      </tbody>
    </table></div>
    {rows.length === 0 && <p className="muted">{t('door.config.choirs.empty')}</p>}
    <p className="muted">{t('door.config.choirs.registerNote')}</p>
    <details className="scheduling-config-advanced"><summary>{t('door.config.availability.heading')}</summary>
      <ChoirAvailabilityEditor canWrite={editable} />
    </details>
  </LoadState>;
}

/* ── 4. Rules ── */

type FreqDraft = { on: boolean; kind: string; target: string; period: string; counting: string };
type ExDraft = { key: string; choirId: string; eligible: 'inherit' | 'yes' | 'no'; fOn: boolean; fKind: string; fTarget: string; fPeriod: string };
type RuleDraft = {
  scope: string[]; targetKind: 'category' | 'choir'; categoryId: string; choirId: string; arrangement: Arrangement;
  min: string; max: string; requireAll: boolean; freq: FreqDraft; exceptions: ExDraft[];
};
const emptyFreq: FreqDraft = { on: false, kind: 'MINIMUM', target: '1', period: 'MONTH', counting: 'ASSIGNMENTS' };
const blankRule = (): RuleDraft => ({ scope: [], targetKind: 'category', categoryId: '', choirId: '', arrangement: 'ROTATION', min: '', max: '', requireAll: false, freq: emptyFreq, exceptions: [] });
const ruleDraft = (r: MusicRuleApi): RuleDraft => ({
  scope: r.scope, targetKind: r.target.kind, categoryId: r.target.kind === 'category' ? r.target.categoryId : '', choirId: r.target.kind === 'choir' ? r.target.choirId : '',
  arrangement: r.arrangement, min: r.minCount === null ? '' : String(r.minCount), max: r.maxCount === null ? '' : String(r.maxCount), requireAll: r.requireAll,
  freq: r.frequency ? { on: true, kind: r.frequency.kind, target: String(r.frequency.target), period: r.frequency.period, counting: r.frequency.counting } : emptyFreq,
  exceptions: r.exceptions.map((e) => ({
    key: crypto.randomUUID(), choirId: e.choirId, eligible: e.eligible === undefined ? 'inherit' : e.eligible ? 'yes' : 'no',
    fOn: !!e.frequency, fKind: e.frequency?.kind ?? '', fTarget: e.frequency?.target ? String(e.frequency.target) : '', fPeriod: e.frequency?.period ?? '',
  })),
});
const toInput = (d: RuleDraft): MusicRuleInputApi => {
  const int = (v: string) => v.trim() === '' ? null : Number(v);
  return {
    scope: d.scope,
    target: d.targetKind === 'category' ? { kind: 'category', categoryId: d.categoryId } : { kind: 'choir', choirId: d.choirId },
    arrangement: d.arrangement,
    minCount: d.arrangement === 'ROTATION' ? int(d.min) : null, maxCount: d.arrangement === 'ROTATION' ? int(d.max) : null,
    requireAll: d.arrangement === 'ROTATION' && d.targetKind === 'category' ? d.requireAll : false,
    frequency: d.freq.on ? { kind: d.freq.kind as RuleFrequencyApi['kind'], target: Number(d.freq.target), period: d.freq.period as RuleFrequencyApi['period'], counting: d.freq.counting as RuleFrequencyApi['counting'] } : null,
    exceptions: d.targetKind === 'category' ? d.exceptions.filter((e) => e.choirId).map((e) => ({
      choirId: e.choirId,
      ...(e.eligible === 'inherit' ? {} : { eligible: e.eligible === 'yes' }),
      ...(e.fOn ? { frequency: { ...(e.fKind ? { kind: e.fKind as RuleFrequencyApi['kind'] } : {}), ...(e.fTarget ? { target: Number(e.fTarget) } : {}), ...(e.fPeriod ? { period: e.fPeriod as RuleFrequencyApi['period'] } : {}) } } : {}),
    })).filter((e) => e.eligible !== undefined || (e.frequency && Object.keys(e.frequency).length)) : [],
  };
};

/** Cheap client-side mirror of the server's value checks, so obvious slips are caught before the round trip. */
function localErrors(d: RuleDraft, t: Tn): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = [];
  if (!d.scope.length) out.push({ field: 'rule-services', text: t('door.config.rule.err.services') });
  if (d.targetKind === 'category' && !d.categoryId) out.push({ field: 'rule-target', text: t('door.config.rule.err.category') });
  if (d.targetKind === 'choir' && !d.choirId) out.push({ field: 'rule-target', text: t('door.config.rule.err.choir') });
  const min = d.min.trim() === '' ? null : Number(d.min), max = d.max.trim() === '' ? null : Number(d.max);
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))) out.push({ field: 'rule-min', text: t('door.config.rule.err.counts') });
  else if (min !== null && max !== null && min > max) out.push({ field: 'rule-min', text: t('door.config.rule.err.minMax') });
  if (d.freq.on && (!Number.isInteger(Number(d.freq.target)) || Number(d.freq.target) <= 0)) out.push({ field: 'rule-frequency', text: t('door.config.rule.err.frequency') });
  return out;
}

/** Where a server error belongs. Services-tab problems (weekday, recurrence, dates...) leave the dialog; the rest focus a field. */
function locateError(message: string): { field: string; tab?: 'services' | 'categories' | 'choirs' } | null {
  const m = message.toLowerCase();
  if (/weekday|recurrence|repeats|start time|selected dates|custom dates|capacity|two active services/.test(m)) return { field: 'services-tab', tab: 'services' };
  if (/not linked to any category|has no category|not in /.test(m)) return { field: 'choirs-tab', tab: 'choirs' };
  if (/frequency/.test(m)) return { field: 'rule-frequency' };
  if (/exception/.test(m)) return { field: 'rule-exceptions' };
  if (/minimum|maximum|choir count|choirs from|eligible linked/.test(m)) return { field: 'rule-min' };
  if (/categor/.test(m)) return { field: 'rule-target' };
  if (/service|sunday|saturday|monday|tuesday|wednesday|thursday|friday/.test(m)) return { field: 'rule-services' };
  return null;
}

function RuleDialog({ rule, services, categories, choirs, onClose, onSaved, goTo }: {
  rule: MusicRuleApi | null; services: SchedulingServiceApi[]; categories: ChoirCategoryApi[];
  choirs: Array<{ id: string; name: string; active: boolean; categoryId: string | null }>;
  onClose: () => void; onSaved: () => void; goTo: (tab: string) => void;
}) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft<RuleDraft>(rule ? ruleDraft(rule) : blankRule());
  const [errors, setErrors] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [freqOpen, setFreqOpen] = useState(draft.freq.on);
  const [exOpen, setExOpen] = useState(draft.exceptions.length > 0);
  const local = localErrors(draft, t);
  const usable = services.filter((s) => s.active && s.musicRequired);
  const catChoirs = choirs.filter((c) => c.active && c.categoryId === draft.categoryId);
  const choirsByCategory = categories.map((k) => ({ k, rows: choirs.filter((c) => c.active && c.categoryId === k.id) })).filter((g) => g.rows.length);
  const isRotation = draft.arrangement === 'ROTATION';
  const setTargetKind = (kind: 'category' | 'choir') => set({ targetKind: kind, arrangement: kind === 'choir' ? 'FIXED' : draft.arrangement === 'FIXED' ? 'ROTATION' : draft.arrangement });
  const focusField = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const jump = (message: string) => {
    const where = locateError(message);
    if (!where) return;
    if (where.tab) { setup.saved(); onClose(); goTo(where.tab); requestAnimationFrame(() => focusField(where.field)); return; }
    if (where.field === 'rule-frequency') setFreqOpen(true);
    if (where.field === 'rule-exceptions') setExOpen(true);
    focusField(where.field);
  };
  const save = async () => {
    if (local.length || working) return;
    setWorking(true); setErrors([]);
    try {
      const input = toInput(draft);
      await (rule ? updateMusicRule(rule.id, input) : createMusicRule(input));
      setup.saved(); onSaved(); onClose();
    } catch (reason) {
      const body = reason instanceof ApiError ? reason.body as { errors?: string[]; message?: string; error?: string } | undefined : undefined;
      setErrors(body?.errors?.length ? body.errors : [body?.message ?? body?.error ?? (reason instanceof Error ? reason.message : t('door.config.err.server'))]);
    } finally { setWorking(false); }
  };
  const freqPreview = draft.freq.on ? formatFrequency({ kind: draft.freq.kind as RuleFrequencyApi['kind'], target: Number(draft.freq.target) || 0, period: draft.freq.period as RuleFrequencyApi['period'], counting: draft.freq.counting as RuleFrequencyApi['counting'] }, t) : '—';
  return <SidePanel open title={rule ? t('door.config.rule.edit') : t('door.config.rule.add')} onClose={() => { setup.saved(); onClose(); }}
    onSave={() => void save()} saveLabel={t('door.settings.save')} saving={working}>
    <div className="pt-edit scheduling-rule-dialog">
      {errors.length > 0 && <div className="door-error" role="alert">
        <strong>{t('door.config.rule.err.heading')}</strong>
        <ul>{errors.map((message) => { const can = !!locateError(message); return <li key={message}>{message} {can && <button type="button" className="btn ghost sm" onClick={() => jump(message)}>{t('door.config.rule.err.jump')}</button>}</li>; })}</ul>
      </div>}
      {local.length > 0 && <ul className="muted" aria-live="polite">{local.map((e) => <li key={e.text}><button type="button" className="btn ghost sm" onClick={() => focusField(e.field)}>{e.text}</button></li>)}</ul>}

      <fieldset id="rule-services" tabIndex={-1}><legend>{t('door.config.rule.services')}</legend>
        {usable.map((s) => <label key={s.id}><input type="checkbox" checked={draft.scope.includes(s.id)}
          onChange={(e) => set({ scope: e.target.checked ? [...draft.scope, s.id] : draft.scope.filter((id) => id !== s.id) })} /> {serviceLabel(t, s)}</label>)}
        {usable.length === 0 && <p className="muted">{t('door.config.services.empty')}</p>}
      </fieldset>

      <fieldset id="rule-target" tabIndex={-1}><legend>{t('door.config.rule.target')}</legend>
        <label><input type="radio" name="rule-target-kind" checked={draft.targetKind === 'category'} onChange={() => setTargetKind('category')} /> {t('door.config.rule.target.category')}</label>
        {draft.targetKind === 'category' && <select aria-label={t('door.config.rule.target.category')} value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value, exceptions: [] })}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {categories.filter((k) => k.active).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>}
        <label><input type="radio" name="rule-target-kind" checked={draft.targetKind === 'choir'} onChange={() => setTargetKind('choir')} /> {t('door.config.rule.target.choir')}</label>
        {draft.targetKind === 'choir' && <select aria-label={t('door.config.rule.target.choir')} value={draft.choirId} onChange={(e) => set({ choirId: e.target.value })}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {choirsByCategory.map(({ k, rows }) => <optgroup key={k.id} label={k.name}>{rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
        </select>}
      </fieldset>

      <fieldset><legend>{t('door.config.rule.arrangement')}</legend>
        <div className="scheduling-segmented" role="group" aria-label={t('door.config.rule.arrangement')}>
          {(['FIXED', 'ROTATION', 'MANUAL'] as const).map((a) => {
            const blocked = draft.targetKind === 'choir' ? a !== 'FIXED' : a === 'FIXED';
            return <button key={a} type="button" className={'btn sm' + (draft.arrangement === a ? '' : ' ghost')} aria-pressed={draft.arrangement === a} disabled={blocked}
              title={blocked ? t(draft.targetKind === 'choir' ? 'door.config.rule.hint.choirFixed' : 'door.config.rule.hint.categoryNotFixed') : undefined}
              onClick={() => set({ arrangement: a })}>{t(`door.config.rule.arrangement.${a}` as Parameters<Tn>[0])}</button>;
          })}
        </div>
        <p className="muted">{t(`door.config.rule.arrangementHelp.${draft.arrangement}` as Parameters<Tn>[0])}</p>
      </fieldset>

      {isRotation && <fieldset><legend>{t('door.config.rule.counts')}</legend>
        <label>{t('door.config.rule.min')}<input id="rule-min" type="number" min={0} value={draft.min} onChange={(e) => set({ min: e.target.value })} /></label>
        <label>{t('door.config.rule.max')}<input id="rule-max" type="number" min={0} value={draft.max} onChange={(e) => set({ max: e.target.value })} /></label>
        {draft.targetKind === 'category' && <label><input type="checkbox" checked={draft.requireAll} onChange={(e) => set({ requireAll: e.target.checked })} /> {t('door.config.rule.requireAll')}</label>}
      </fieldset>}

      <details id="rule-frequency" className="scheduling-config-advanced" open={freqOpen} onToggle={(e) => setFreqOpen((e.target as HTMLDetailsElement).open)} tabIndex={-1}>
        <summary>{t('door.config.rule.frequency')}</summary>
        <label><input type="checkbox" checked={draft.freq.on} onChange={(e) => set({ freq: { ...draft.freq, on: e.target.checked } })} /> {t('door.config.rule.frequency.on')}</label>
        {draft.freq.on && <div className="door-form">
          <label>{t('door.config.policy.kind')}<select value={draft.freq.kind} onChange={(e) => set({ freq: { ...draft.freq, kind: e.target.value } })}>
            {['MINIMUM', 'TARGET', 'MAXIMUM'].map((k) => <option key={k} value={k}>{t(`door.config.frequencyChoice.${k}` as Parameters<Tn>[0])}</option>)}</select></label>
          <label>{t('door.config.rule.frequency.target')}<input type="number" min={1} value={draft.freq.target} onChange={(e) => set({ freq: { ...draft.freq, target: e.target.value } })} /></label>
          <label>{t('door.config.policy.period')}<select value={draft.freq.period} onChange={(e) => set({ freq: { ...draft.freq, period: e.target.value } })}>
            {['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'].map((p) => <option key={p} value={p}>{t(`door.config.period.${p}` as Parameters<Tn>[0])}</option>)}</select></label>
          <label>{t('door.config.rule.frequency.counting')}<select value={draft.freq.counting} onChange={(e) => set({ freq: { ...draft.freq, counting: e.target.value } })}>
            {['ASSIGNMENTS', 'DISTINCT_DATES'].map((c) => <option key={c} value={c}>{t(`door.config.counting.${c}` as Parameters<Tn>[0])}</option>)}</select></label>
        </div>}
        <p className="muted" aria-live="polite">{t('door.config.rule.frequency.preview', { value: freqPreview })}</p>
      </details>

      {draft.targetKind === 'category' && <details id="rule-exceptions" className="scheduling-config-advanced" open={exOpen} onToggle={(e) => setExOpen((e.target as HTMLDetailsElement).open)} tabIndex={-1}>
        <summary>{t('door.config.rule.exceptions')}</summary>
        <p className="muted">{t('door.config.rule.exceptions.help')}</p>
        {draft.exceptions.map((ex, index) => {
          const patch = (p: Partial<ExDraft>) => set({ exceptions: draft.exceptions.map((row, i) => i === index ? { ...row, ...p } : row) });
          return <div key={ex.key} className="scheduling-config-override-row">
            <select aria-label={t('door.config.col.choir')} value={ex.choirId} onChange={(e) => patch({ choirId: e.target.value })}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {catChoirs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select aria-label={t('door.config.rule.exception.eligible')} value={ex.eligible} onChange={(e) => patch({ eligible: e.target.value as ExDraft['eligible'] })}>
              <option value="inherit">{t('door.config.inherit')}</option><option value="yes">{t('door.config.rule.exception.takesPart')}</option><option value="no">{t('door.config.rule.exception.sitsOut')}</option>
            </select>
            <label><input type="checkbox" checked={ex.fOn} onChange={(e) => patch({ fOn: e.target.checked })} /> {t('door.config.rule.exception.ownFrequency')}</label>
            {ex.fOn && <>
              <input type="number" min={1} aria-label={t('door.config.rule.frequency.target')} value={ex.fTarget} onChange={(e) => patch({ fTarget: e.target.value })} />
              <select aria-label={t('door.config.policy.period')} value={ex.fPeriod} onChange={(e) => patch({ fPeriod: e.target.value })}>
                <option value="">{t('door.config.inherit')}</option>
                {['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'].map((p) => <option key={p} value={p}>{t(`door.config.period.${p}` as Parameters<Tn>[0])}</option>)}</select>
            </>}
            <button type="button" className="btn ghost sm" onClick={() => set({ exceptions: draft.exceptions.filter((_, i) => i !== index) })}>{t('door.config.override.removeAction')}</button>
          </div>;
        })}
        <button type="button" className="btn ghost sm" disabled={!draft.categoryId} onClick={() => set({ exceptions: [...draft.exceptions, { key: crypto.randomUUID(), choirId: '', eligible: 'inherit', fOn: false, fKind: '', fTarget: '', fPeriod: '' }] })}>{t('door.config.rule.exception.add')}</button>
      </details>}
    </div>
  </SidePanel>;
}

export function RulesEditor({ systemId, canWrite, goTo }: Props & { goTo: (tab: string) => void }) {
  const t = useT();
  const editable = canWrite && systemId === 'sys-music';
  const rules = useLoad(() => fetchMusicRules(), 'sched-config-rules');
  const services = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-services|${systemId}`);
  const cats = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const state = useSaveState();
  const [dialog, setDialog] = useState<MusicRuleApi | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<MusicRuleApi | null>(null);
  const [showEx, setShowEx] = useState<MusicRuleApi | null>(null);
  const exRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = exRef.current; if (!d) return; if (showEx && !d.open) d.showModal(); if (!showEx && d.open) d.close(); }, [showEx]);
  const rows = rules.data?.rules ?? [];
  const sv = services.data?.services ?? [], ck = cats.data?.categories ?? [], ch = choirs.data?.choirs ?? [];
  const reload = () => { rules.reload(); choirs.reload(); };
  const names: RuleNames = {
    service: (id) => { const s = sv.find((x) => x.id === id); return s ? serviceLabel(t, s) : t('door.config.nameUnavailable.service'); },
    category: (id) => ck.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.category'),
    choir: (id) => ch.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.choir'),
    serviceShort: (id) => sv.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.service'),
  };
  const target = (r: MusicRuleApi) => r.target.kind === 'category' ? t('door.config.rule.allOf', { name: names.category(r.target.categoryId) }) : names.choir(r.target.choirId);
  const groupCount = new Map<string, number>();
  for (const r of rows) if (r.sharedPolicyId && r.target.kind === 'choir') groupCount.set(r.sharedPolicyId, (groupCount.get(r.sharedPolicyId) ?? 0) + 1);
  const sentences = ruleSentences(rows, names, t);
  return <LoadState loading={rules.loading || services.loading || cats.loading || choirs.loading}
    failed={rules.failed || services.failed || cats.failed || choirs.failed} retry={() => { rules.reload(); services.reload(); cats.reload(); choirs.reload(); }}>
    <FormNotice state={state} />
    {(rules.data?.warnings ?? []).map((w) => <SectionNotice key={w.choirId} tone="warn">{w.message}{' '}<button type="button" className="btn ghost sm" onClick={() => goTo('choirs')}>{t('door.config.rule.warning.fix')}</button></SectionNotice>)}
    <p className="scheduling-rules-preview" aria-label={t('door.config.rules.previewLabel')}>{sentences.length ? sentences.join(' ') : t('door.config.rules.previewEmpty')}</p>
    {editable && <button type="button" className="btn sm" onClick={() => { state.clear(); setDialog('new'); }}>{t('door.config.rule.add')}</button>}
    <div className="scheduling-table-scroll"><table className="scheduling-table">
      <thead><tr>
        <th>{t('door.config.rule.services')}</th><th>{t('door.config.rule.target')}</th><th>{t('door.config.rule.arrangement')}</th>
        <th>{t('door.config.col.minMax')}</th><th>{t('door.config.rule.frequency')}</th><th>{t('door.config.rule.exceptions')}</th><th />
      </tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id} data-shared={r.sharedPolicyId && (groupCount.get(r.sharedPolicyId) ?? 0) > 1 ? r.sharedPolicyId : undefined}>
          <td>{r.scope.map((id) => <StatusChip key={id} tone="neutral">{names.service(id)}</StatusChip>)}</td>
          <td>{target(r)}{r.categoryEligible === false && <StatusChip tone="warn">{t('door.config.rule.categorySitsOut')}</StatusChip>}{r.dateScope && <span className="muted"> · {[r.dateScope.serviceDate, r.dateScope.serviceTime].filter(Boolean).join(' ')}</span>}</td>
          <td>{t(`door.config.rule.arrangement.${r.arrangement}` as Parameters<Tn>[0])}</td>
          <td>{formatMinMax(r)}</td>
          <td>{formatFrequency(r.frequency, t)}</td>
          <td>{r.exceptions.length ? <button type="button" className="btn ghost sm" onClick={() => setShowEx(r)}>{t('door.config.rule.exceptions.count', { count: r.exceptions.length })}</button> : '—'}</td>
          <td className="scheduling-table-actions">{editable && <>
            {!r.readOnly && <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setDialog(r); }}>{t('door.settings.edit')}</button>}
            <button type="button" className="btn ghost sm" onClick={() => setToDelete(r)}>{t('door.config.delete')}</button>
          </>}</td>
        </tr>)}
      </tbody>
    </table></div>
    {rows.length === 0 && <p className="muted">{editable ? t('door.config.rules.emptyEditable') : t('door.config.rules.empty')}</p>}
    {dialog && <RuleDialog key={dialog === 'new' ? 'new' : dialog.id} rule={dialog === 'new' ? null : dialog} services={sv} categories={ck} choirs={ch}
      onClose={() => setDialog(null)} onSaved={reload} goTo={goTo} />}
    <ConfirmDialog open={!!toDelete} busy={state.working} title={t('door.config.rule.delete.title')} body={t('door.config.rule.delete.body')} confirmLabel={t('door.config.delete')}
      onCancel={() => setToDelete(null)} onConfirm={() => { const r = toDelete; setToDelete(null); if (r) void state.run(() => deleteMusicRule(r.id), reload); }} />
    <dialog ref={exRef} className="scheduling-exceptions-dialog" onClose={() => setShowEx(null)}>
      {showEx && <>
        <h3>{t('door.config.rule.exceptions')}</h3>
        <p className="muted">{target(showEx)}</p>
        <ul className="door-list">{showEx.exceptions.map((e) => <li key={e.choirId}><strong>{names.choir(e.choirId)}</strong>: {[
          e.eligible === undefined ? null : t(e.eligible ? 'door.config.rule.exception.takesPart' : 'door.config.rule.exception.sitsOut'),
          e.frequency ? formatFrequency(e.frequency as RuleFrequencyApi, t) : null,
        ].filter(Boolean).join(' · ')}</li>)}</ul>
        <form method="dialog"><button className="btn sm">{t('door.config.close')}</button></form>
      </>}
    </dialog>
  </LoadState>;
}

/* ── Choir availability (away dates). Not a rule, so it lives under the Choirs tab. ── */

function ChoirAvailabilityEditor({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const services = useLoad(() => fetchSchedulingServices('sys-music', true), 'sched-config-services-active');
  const away = useLoad(() => fetchMusicAvailability(), 'sched-config-away');
  const name = (id: string) => choirs.data?.choirs.find((c) => c.id === id)?.name ?? id;
  const run = async (job: () => Promise<unknown>) => {
    if (busy) return; setError(''); setBusy(true);
    try { await job(); setup.saved(); away.reload(); } catch (reason) { setError(schedulingError(reason) ?? t('door.config.err.server')); } finally { setBusy(false); }
  };
  return <LoadState loading={choirs.loading || services.loading || away.loading} failed={choirs.failed || services.failed || away.failed} retry={() => { choirs.reload(); services.reload(); away.reload(); }}>
    {error && <p className="door-error" role="alert">{error}</p>}
    <ul className="door-notices">{(away.data?.availability ?? []).map((row) => <li className="panel door-notice" key={row.id}><div className="door-notice-main">
      <strong>{name(row.choirId)}</strong><p>{row.serviceDate}{row.endDate && row.endDate !== row.serviceDate ? ` → ${row.endDate}` : ''}{row.reason ? ` · ${row.reason}` : ''}</p>
      {canWrite && <button className="btn ghost sm" disabled={busy} onClick={() => void run(() => removeMusicAvailability(row.id))}>{t('door.config.delete')}</button>}
    </div></li>)}</ul>
    {!away.data?.availability.length && <EmptyState title={t('door.config.availability.empty')} />}
    {canWrite && <form className="panel door-form" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget, data = new FormData(form);
      void run(() => addMusicAvailability({ choirId: String(data.get('choirId')), fromDate: String(data.get('fromDate')), toDate: String(data.get('toDate')), serviceCode: String(data.get('serviceCode') || '') || null, reason: String(data.get('reason') || '') || null })).then(() => form.reset());
    }}>
      <label>{t('door.config.link.choir')}<select name="choirId" required><option value="">{t('door.gov.meeting.choose')}</option>{(choirs.data?.choirs ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>{t('door.config.unavailability.from')}<input type="date" name="fromDate" required /></label>
      <label>{t('door.config.unavailability.to')}<input type="date" name="toDate" required /></label>
      <label>{t('door.config.availability.service')}<select name="serviceCode"><option value="">{t('door.config.availability.allServices')}</option>{(services.data?.services ?? []).filter((s) => s.musicRequired).map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}</select></label>
      <label>{t('door.config.availability.reason')}<input name="reason" maxLength={500} /></label>
      <button type="submit" disabled={busy} className="btn">{t('door.settings.save')}</button>
    </form>}
  </LoadState>;
}

/* ───────────────────────── Protocol ───────────────────────── */

export function ProtocolRulesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === "sys-protocol";
  const list = useLoad(() => fetchProtocolServiceRules(systemId), `sched-config-protocol|${systemId}`);
  const services = useLoad(() => fetchSchedulingServices("sys-protocol"), "sched-config-protocol-services");
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolServiceRuleApi | null>(null);
  const rows = list.data?.rules ?? [];
  const cancel = () => { setEditing(null); setFormOpen(false); state.clear(); };
  const submit = async (data: FormData) => {
    const dates = data.getAll("overrideDate").map((value) => String(value).trim());
    const sizes = data.getAll("overrideSize").map((value) => String(value).trim());
    const teamSizeOverrides: Record<string, number> = {};
    for (let index = 0; index < Math.max(dates.length, sizes.length); index += 1) {
      const date = dates[index] ?? "";
      const sizeText = sizes[index] ?? "";
      if (!date && !sizeText) continue;
      const size = Number(sizeText);
      if (!date || !Number.isInteger(size) || size <= 0 || teamSizeOverrides[date] !== undefined) {
        state.clear();
        throw new Error(t("door.config.err.teamOverrides"));
      }
      teamSizeOverrides[date] = size;
    }
    const patch = {
      serviceId: str(data, "serviceId"), active: flag(data, "active"),
      required: flag(data, "required"), defaultTeamSize: num(data, "defaultTeamSize", 10),
      teamSizeOverrides, requireChoir: flag(data, "requireChoir"),
      requireWorship: flag(data, "requireWorship"),
      relaxableKinds: preserveRelaxableKinds(editing?.relaxableKinds ?? [], data.getAll("relaxableKind").map(String)),
    };
    const ok = await state.run(
      () => editing ? updateProtocolServiceRule(editing.id, patch)
        : createProtocolServiceRule({ ...patch, systemId: "sys-protocol" }),
      list.reload,
    );
    if (ok) cancel();
  };
  return (
    <LoadState loading={list.loading || services.loading} failed={list.failed || services.failed}
      retry={() => { list.reload(); services.reload(); }}>
      <SectionNotice>{t("door.config.protocol.behaviorNotice")}</SectionNotice>
      {editable && !formOpen && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.protocol.empty" />
      <ul className="door-notices">{rows.map((row) => {
        const service = services.data?.services.find((item) => item.id === row.serviceId || item.code === row.serviceCode);
        return <li key={row.id} className="panel door-notice">
        <div className="door-notice-main">
          <div className="scheduling-config-version-heading">
            <strong>{service?.name ?? t("door.config.nameUnavailable.service")}</strong>
            <StatusChip tone={row.active ? "success" : "neutral"}>
              {row.active ? t("door.config.service.active") : t("door.config.service.inactive")}
            </StatusChip>
          </div>
          <p className="muted">{t("door.config.protocol.targetSummary", { count: row.defaultTeamSize, overrides: Object.keys(row.teamSizeOverrides).length })}</p>
          {editable && <EditToggle onClick={() => { setEditing(row); setFormOpen(true); state.clear(); }} />}
        </div>
      </li>;
      })}</ul>
      {editable && formOpen && <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editRule") : t("door.config.addRule")}
        state={state} editing={!!editing} working={state.working} onCancel={cancel} onSubmit={submit}>
        <SelectField label={t("door.config.tab.services")} name="serviceId" value={editing?.serviceId} required
          options={(services.data?.services ?? []).filter((row) => row.active).map((row) => ({ value: row.id, label: row.name }))} />
        <TextField label={t("door.config.protocol.defaultTeamSize")} name="defaultTeamSize" type="number" min={1} value={editing?.defaultTeamSize ?? 10} required />
        <CheckField label={t("door.config.protocol.required")} name="required" checked={editing?.required ?? true} />
        <TeamSizeOverridesField overrides={editing?.teamSizeOverrides ?? {}} />
        <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
        <CheckField label={t("door.config.protocol.requireChoir")} name="requireChoir" checked={editing?.requireChoir ?? true} />
        <CheckField label={t("door.config.protocol.requireWorship")} name="requireWorship" checked={editing?.requireWorship ?? true} />
        <fieldset className="scheduling-config-overrides">
          <legend>{t("door.config.protocol.relaxable")}</legend>
          {(["SS1", "SS2", "TUESDAY", "IGABURO"] as const).map((kind) => (
            <CheckField key={kind} label={t(`door.config.serviceCode.${kind}` as Parameters<typeof t>[0])}
              name="relaxableKind" value={kind} checked={editing?.relaxableKinds.some((value) => value.toUpperCase() === kind) ?? false} />
          ))}
        </fieldset>
      </SaveForm>}
    </LoadState>
  );
}

export function ProtocolDutyEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === "sys-protocol";
  const policy = useLoad(() => fetchProtocolDutyPolicy(systemId), `sched-config-duty|${systemId}`);
  const state = useSaveState();
  const row = policy.data?.policy ?? null;
  const submit = async (data: FormData) => {
    const patch = {
      preferTarget: num(data, "preferTarget", 3), softMax: num(data, "softMax", 3), hardMax: num(data, "hardMax", 4),
      extraDutyPolicy: str(data, "extraDutyPolicy"),
      duplicateSameDayAllowed: flag(data, "duplicateSameDayAllowed"),
      musicCompatibilityRequired: flag(data, "musicCompatibilityRequired"),
      leadershipPriorities: row?.leadershipPriorities ?? [],
      exceptionsAllowed: row?.exceptionsAllowed ?? true,
    };
    if (patch.softMax! < patch.preferTarget! || patch.hardMax! < patch.softMax!) {
      state.clear();
      throw new Error(t("door.config.err.minMaxDuty"));
    }
    await state.run(
      () => row
        ? updateProtocolDutyPolicy(row.id, patch)
        : createProtocolDutyPolicy({ ...patch, systemId: "sys-protocol" }),
      policy.reload,
    );
  };
  return (
    <LoadState loading={policy.loading} failed={policy.failed} retry={policy.reload}>
      <FormNotice state={state} />
      <SectionNotice tone="warn">{t("door.config.duty.behaviorNotice")}</SectionNotice>
      {row && <div className="panel">
        <h4>{t("door.config.duty.usedHeading")}</h4>
        <ul className="door-list">
          <li><strong>{t("door.config.duty.preferTarget")}:</strong> {row.preferTarget}</li>
          <li><strong>{t("door.config.duty.softMax")}:</strong> {row.softMax}</li>
          <li><strong>{t("door.config.duty.hardMax")}:</strong> {row.hardMax}</li>
        </ul>
        <p className="scheduling-config-notice">{t("door.config.duty.usedNotice")}</p>
        <h4>{t("door.config.duty.notUsedHeading")}</h4>
        <ul className="door-list">
          <li><strong>{t("door.config.duty.extra")}:</strong> {extraDutyPolicyName(row.extraDutyPolicy, t)}</li>
          <li><strong>{t("door.config.duty.duplicate")}:</strong> {row.duplicateSameDayAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
          <li><strong>{t("door.config.duty.music")}:</strong> {row.musicCompatibilityRequired ? t("door.config.form.yes") : t("door.config.form.no")}</li>
          <li><strong>{t("door.config.duty.leadership")}:</strong> {row.leadershipPriorities.length ? row.leadershipPriorities.join(", ") : t("door.config.form.none")}</li>
          <li><strong>{t("door.config.duty.exceptions")}:</strong> {row.exceptionsAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
        </ul>
        <p className="scheduling-config-notice is-warning">{t("door.config.duty.notUsedNotice")}</p>
      </div>}
      {!row && <EmptyOrLocked canEdit={editable} empty emptyKey="door.config.duty.empty" />}
      {editable && <SaveForm key={row?.id ?? "new"} title={row ? t("door.config.editDuty") : t("door.config.addDuty")} state={state}
        editing={false} working={state.working} onCancel={() => state.clear()} onSubmit={submit}>
        <SelectField label={t("door.config.duty.extra")} name="extraDutyPolicy" value={row?.extraDutyPolicy ?? "ALLOW_WHEN_SHORT"} options={["ALLOW_WHEN_SHORT", "NEVER", "ALWAYS"].map(value => ({value, label: extraDutyPolicyName(value as "ALLOW_WHEN_SHORT", t)}))} />
        <CheckField label={t("door.config.duty.duplicate")} name="duplicateSameDayAllowed" checked={row?.duplicateSameDayAllowed ?? false} />
        <CheckField label={t("door.config.duty.music")} name="musicCompatibilityRequired" checked={row?.musicCompatibilityRequired ?? true} />
        <TextField label={t("door.config.duty.preferTarget")} name="preferTarget" type="number" min={1} value={row?.preferTarget ?? 3} required />
        <TextField label={t("door.config.duty.softMax")} name="softMax" type="number" min={1} value={row?.softMax ?? 3} required />
        <TextField label={t("door.config.duty.hardMax")} name="hardMax" type="number" min={1} value={row?.hardMax ?? 4} required />
      </SaveForm>}
    </LoadState>
  );
}
