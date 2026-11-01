import { Link } from 'react-router-dom';
import { useChoirRegister, useChoirRegisterRefresh } from './useChoirRegister';
import { musicExceptions, preserveRelaxableKinds, schedulingError } from "./schedulingForms";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  createCategoryServicePolicy,
  createChoirCategory,
  createChoirCategoryLink,
  createProtocolDutyPolicy,
  createProtocolServiceRule,
  createSchedulingService,
  fetchCategoryServicePolicies,
  fetchChoirCategories,
  fetchChoirCategoryLinks,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  updateCategoryServicePolicy,
  updateChoirCategory,
  updateChoirCategoryLink,
  updateProtocolDutyPolicy,
  updateProtocolServiceRule,
  updateSchedulingService,
  type CategoryServicePolicyApi,
  type ChoirCategoryApi,
  type ChoirCategoryLinkApi,
  type ConfigVersionApi,
  type ProtocolServiceRuleApi,
  type SchedulingServiceApi,
} from "../api/frontDoorApi";
import { useT } from "../i18n/I18nContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import {
  extraDutyPolicyName,
  policySummary,
  recurrenceKey,
  serviceSummary,
  serviceKindKey,
} from "./config";
import { StatusChip } from "./kit";

type Props = {
  systemId: string;
  version: ConfigVersionApi | undefined;
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

function SubmitButtons({ editing, working, onCancel }: { editing: boolean; working: boolean; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="door-row">
      <button type="submit" className="btn sm" disabled={working}>{t("door.settings.save")}</button>
      {editing && <button type="button" className="btn ghost sm" disabled={working} onClick={onCancel}>{t("door.settings.cancel")}</button>}
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
const flag = (data: FormData, key: string) => data.has(key);
function SaveForm({ title, state, children, onSubmit, editing, working, onCancel }: {
  title: string; state: SaveState; children: ReactNode; onSubmit: (data: FormData) => Promise<void>;
  editing: boolean; working: boolean; onCancel: () => void;
}) {
  return (
    <form className="panel door-form" onSubmit={(event) => {
      event.preventDefault();
      void onSubmit(readForm(event.currentTarget)).catch(state.fail);
    }}>
      <h3>{title}</h3>
      {children}
      <SubmitButtons editing={editing} working={working} onCancel={onCancel} />
    </form>
  );
}

function EmptyOrLocked({ canEdit, empty, emptyKey }: { canEdit: boolean; empty: boolean; emptyKey: Parameters<ReturnType<typeof useT>>[0] }) {
  const t = useT();
  if (!empty) return null;
  return <p className="muted">{canEdit ? t("door.config.emptyDraft") : t(emptyKey)}</p>;
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

export function ServicesEditor({ systemId, version, canWrite, onRequestEdit, preparing, intent, onIntentHandled }: Props & {
  onRequestEdit?: (code: string | null) => Promise<void>;
  preparing?: boolean;
  intent?: { code: string | null } | null;
  onIntentHandled?: () => void;
}) {
  const t = useT();
  const isMusic = systemId === "sys-music";
  const configVersionId = isMusic ? version?.id : undefined;
  const editable = canWrite && isMusic && version?.status === "DRAFT";
  const list = useLoad(() => fetchSchedulingServices(systemId, false, configVersionId), `sched-config-services|${systemId}|${configVersionId ?? "active"}`);
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingServiceApi | null>(null);
  const rows = list.data?.services ?? [];
  useEffect(() => {
    if (!intent || !editable || !list.data || list.loading || list.failed) return;
    const row = intent.code === null ? null : rows.find((service) => service.code === intent.code);
    if (intent.code !== null && !row) {
      state.fail(new Error(t("door.config.service.missingInDraft")));
    } else {
      setEditing(row ?? null);
      setFormOpen(true);
      state.clear();
    }
    onIntentHandled?.();
  });
  const openEditor = (row: SchedulingServiceApi | null) => {
    if (preparing) return;
    if (!editable) { void onRequestEdit?.(row?.code ?? null); return; }
    setEditing(row); setFormOpen(true); state.clear();
  };
  const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
  const submit = async (data: FormData) => {
    if (!configVersionId) return;
    const patch = {
      code: str(data, "code"), name: str(data, "name"), kind: str(data, "kind"),
      weekday: num(data, "weekday"), time: str(data, "time") || null,
      recurrence: str(data, "recurrence"),
      selectedDates: str(data, "selectedDates").split(/[\n,]+/).map((date) => date.trim()).filter(Boolean),
      active: flag(data, "active"), musicRequired: flag(data, "musicRequired"),
      protocolRequired: flag(data, "protocolRequired"), maxChoirs: num(data, "maxChoirs", 3),
      displayOrder: num(data, "displayOrder", 0),
    };
    const ok = await state.run(
      () => editing
        ? updateSchedulingService(editing.id, configVersionId, patch)
        : createSchedulingService({ ...patch, systemId: "sys-music", configVersionId }),
      list.reload,
    );
    if (ok) cancel(false);
  };
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {!isMusic && <SectionNotice>{t("door.config.sharedCalendarReadOnly")}</SectionNotice>}
      {isMusic && <SectionNotice tone="warn">{t("door.config.service.supportNotice")}</SectionNotice>}
      {canWrite && isMusic && <>
        {!editable && <SectionNotice>{t("door.config.service.editViaDraft")}</SectionNotice>}
        <button type="button" className="btn sm" disabled={preparing} onClick={() => openEditor(null)}>{t("door.config.add")}</button>
      </>}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.services.empty" />
      <ul className="door-notices">
        {rows.map((row) => <li key={row.id} className="panel door-notice">
          <div className="door-notice-main">
            <div className="scheduling-config-version-heading">
              <strong>{row.name}</strong>
              <StatusChip tone={row.active ? "success" : "neutral"}>
                {row.active ? t("door.config.service.active") : t("door.config.service.inactive")}
              </StatusChip>
            </div>
            <p className="muted">{serviceSummary(row, t)}</p>
            <div className="scheduling-config-tags">
              <StatusChip tone={row.musicRequired ? "info" : "neutral"}>
                {t("door.config.service.musicParticipation", { value: row.musicRequired ? t("door.config.form.yes") : t("door.config.form.no") })}
              </StatusChip>
              <StatusChip tone={row.protocolRequired ? "info" : "neutral"}>
                {t("door.config.service.protocolParticipation", { value: row.protocolRequired ? t("door.config.form.yes") : t("door.config.form.no") })}
              </StatusChip>
              {!isMusic && <StatusChip tone="neutral">
                {t("door.config.service.teamSize", { count: row.targetTeamSize })}
              </StatusChip>}
            </div>
            {canWrite && isMusic && <button type="button" className="btn ghost sm" disabled={preparing} onClick={() => openEditor(row)}>{t("door.settings.edit")}</button>}
          </div>
        </li>)}
      </ul>
      {editable && formOpen && (
        <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editService") : t("door.config.addService")} state={state}
          editing working={state.working} onCancel={cancel} onSubmit={submit}>
          <TextField label={t("door.config.service.code")} name="code" value={editing?.code} required pattern="[A-Za-z0-9_-]{1,40}" />
          <TextField label={t("door.config.service.name")} name="name" value={editing?.name} required />
          <SelectField label={t("door.config.service.kind")} name="kind" value={editing?.kind}
            options={["SERVICE", "REHEARSAL", "MEETING", "OTHER"].map((kind) => ({ value: kind, label: t(serviceKindKey(kind as SchedulingServiceApi["kind"])) }))} />
          <SelectField label={t("door.config.service.weekday")} name="weekday" value={editing?.weekday == null ? "" : String(editing.weekday)}
            options={[{ value: "", label: t("door.config.form.any") }, ...Array.from({ length: 7 }, (_, day) => ({ value: String(day), label: t(`door.caring.weekday.${day}` as Parameters<typeof t>[0]) }))]} />
          <TextField label={t("door.config.service.time")} name="time" type="time" value={editing?.time ?? ""} />
          <SelectField label={t("door.config.service.recurrence")} name="recurrence" value={editing?.recurrence}
            options={["WEEKLY", "MONTHLY", "SELECTED_DATES", "CUSTOM"].map((recurrence) => ({ value: recurrence, label: t(recurrenceKey(recurrence as SchedulingServiceApi["recurrence"])) }))} />
          <TextField label={t("door.config.service.selectedDates")} name="selectedDates" value={editing?.selectedDates.join(", ")} />
          <TextField label={t("door.config.policy.max")} name="maxChoirs" type="number" min={0} value={editing?.maxChoirs ?? 3} required />
          <TextField label={t("door.config.service.order")} name="displayOrder" type="number" min={0} value={editing?.displayOrder ?? 0} />
          <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
          <CheckField label={t("door.config.service.music")} name="musicRequired" checked={editing?.musicRequired ?? true} />
          <CheckField label={t("door.config.service.protocol")} name="protocolRequired" checked={editing?.protocolRequired ?? true} />
        </SaveForm>
      )}
    </LoadState>
  );
}

export function CategoriesEditor({ systemId, version, canWrite }: Props) {
  const t = useT();
  const versionId = version?.id;
  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
  const list = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-cats|${systemId}|${versionId ?? "active"}`);
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChoirCategoryApi | null>(null);
  const rows = list.data?.categories ?? [];
  const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
  const submit = async (data: FormData) => {
    if (!versionId) return;
    const patch = { code: str(data, "code"), name: str(data, "name"), description: str(data, "description"), active: flag(data, "active") };
    const ok = await state.run(
      () => editing ? updateChoirCategory(editing.id, versionId, patch)
        : createChoirCategory({ ...patch, systemId: "sys-music", configVersionId: versionId }),
      list.reload,
    );
    if (ok) cancel(false);
  };
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {editable && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.categories.empty" />
      <ul className="door-notices">{rows.map((row) => <li key={row.id} className="panel door-notice">
        <div className="door-notice-main">
          <div className="scheduling-config-version-heading">
            <strong>{row.name}</strong>
            <StatusChip tone={row.active ? "success" : "neutral"}>
              {row.active ? t("door.config.service.active") : t("door.config.service.inactive")}
            </StatusChip>
          </div>
          <p className="muted">{row.description || row.code}</p>
          {editable && <EditToggle onClick={() => { setEditing(row); setFormOpen(true); state.clear(); }} />}
        </div>
      </li>)}</ul>
      {editable && formOpen && <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editCategory") : t("door.config.addCategory")}
        state={state} editing={!!editing} working={state.working} onCancel={cancel} onSubmit={submit}>
        <TextField label={t("door.config.category.code")} name="code" value={editing?.code} required pattern="[A-Za-z0-9_-]{1,40}" />
        <TextField label={t("door.config.category.name")} name="name" value={editing?.name} required />
        <TextField label={t("door.config.category.description")} name="description" value={editing?.description} />
        <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
      </SaveForm>}
    </LoadState>
  );
}

export function PoliciesEditor({ systemId, version, canWrite }: Props) {
  const t = useT();
  const versionId = version?.id;
  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
  const list = useLoad(() => fetchCategoryServicePolicies(systemId, versionId), `sched-config-policies|${systemId}|${versionId ?? "active"}`);
  const categories = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-policy-cats|${versionId ?? "active"}`);
  const services = useLoad(() => fetchSchedulingServices(systemId, false, versionId), `sched-config-policy-services|${versionId ?? "active"}`);
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryServicePolicyApi | null>(null);
  const rows = list.data?.policies ?? [];
  const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
  const submit = async (data: FormData) => {
    if (!versionId) return;
    const target = str(data, "frequencyTarget");
    const minimum = str(data, "minCount");
    const maximum = str(data, "maxCount");
    const patch = {
      categoryId: str(data, "categoryId"), serviceId: str(data, "serviceId"),
      eligible: flag(data, "eligible"), active: flag(data, "active"),
      frequencyTarget: target ? Number(target) : null,
      frequencyCounting: str(data, "frequencyCounting"), frequencyKind: str(data, "frequencyKind"),
      frequencyPeriod: str(data, "frequencyPeriod") || null, planningMode: str(data, "planningMode"), minCount: minimum ? Number(minimum) : null,
      maxCount: maximum ? Number(maximum) : null, requireAll: flag(data, "requireAll"),
    };
    if (patch.minCount !== null && patch.maxCount !== null && patch.minCount > patch.maxCount) {
      throw new Error(t("door.config.err.minMax"));
    }
    const ok = await state.run(
      () => editing ? updateCategoryServicePolicy(editing.id, versionId, patch)
        : createCategoryServicePolicy({ ...patch, systemId: "sys-music", configVersionId: versionId }),
      list.reload,
    );
    if (ok) cancel(false);
  };
  return (
    <LoadState loading={list.loading || categories.loading || services.loading}
      failed={list.failed || categories.failed || services.failed} retry={() => { list.reload(); categories.reload(); services.reload(); }}>
      <SectionNotice tone="warn">{t("door.config.policy.behaviorNotice")}</SectionNotice>
      {editable && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.policies.empty" />
      <ul className="door-notices">{rows.map((row) => {
        const category = categories.data?.categories.find((item) => item.id === row.categoryId);
        const service = services.data?.services.find((item) => item.id === row.serviceId);
        return <li key={row.id} className="panel door-notice">
        <div className="door-notice-main">
          <div className="scheduling-config-version-heading">
            <strong>{t("door.config.policy.pair", {
              category: category?.name ?? t("door.config.nameUnavailable.category"),
              service: service?.name ?? t("door.config.nameUnavailable.service"),
            })}</strong>
            <StatusChip tone={row.active ? "success" : "neutral"}>
              {row.active ? t("door.config.service.active") : t("door.config.service.inactive")}
            </StatusChip>
          </div>
          <p className="muted">{policySummary(row, t)}</p>
          {editable && <EditToggle onClick={() => { setEditing(row); setFormOpen(true); state.clear(); }} />}
        </div>
      </li>;
      })}</ul>
      {editable && formOpen && <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editPolicy") : t("door.config.addPolicy")}
        state={state} editing={!!editing} working={state.working} onCancel={cancel} onSubmit={submit}>
        <SelectField label={t("door.config.tab.categories")} name="categoryId" value={editing?.categoryId} required
          options={(categories.data?.categories ?? []).map((row) => ({ value: row.id, label: row.name }))} />
        <SelectField label={t("door.config.tab.services")} name="serviceId" value={editing?.serviceId} required
          options={(services.data?.services ?? []).map((row) => ({ value: row.id, label: row.name }))} />
        <CheckField label={t("door.config.policy.eligible")} name="eligible" checked={editing?.eligible ?? true} />
        <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
        <SelectField label={t("door.config.policy.mode")} name="planningMode" value={editing?.planningMode ?? "ROTATION"} options={["ROTATION", "FIXED", "MANUAL"].map(value => ({ value, label: t(`door.config.planningMode.${value}` as Parameters<typeof t>[0]) }))} />
        <SelectField label={t("door.config.policy.period")} name="frequencyPeriod" value={editing?.frequencyPeriod ?? ""} options={[{value: "", label: t("door.config.form.none")}, ...["MONTH", "QUARTER", "HALF_YEAR", "YEAR"].map(value => ({value, label: t(`door.config.period.${value}` as Parameters<typeof t>[0])}))]} />
        <TextField label={t("door.config.policy.target")} name="frequencyTarget" type="number" min={1} value={editing?.frequencyTarget ?? ""} />
        <SelectField label={t("door.config.policy.counting")} name="frequencyCounting" value={editing?.frequencyCounting}
          options={["ASSIGNMENTS", "DISTINCT_DATES"].map((value) => ({ value, label: t(`door.config.counting.${value}` as Parameters<typeof t>[0]) }))} />
        <SelectField label={t("door.config.policy.kind")} name="frequencyKind" value={editing?.frequencyKind}
          options={["MINIMUM", "TARGET", "MAXIMUM"].map((value) => ({ value, label: t(`door.config.frequencyKind.${value}` as Parameters<typeof t>[0]) }))} />
        <TextField label={t("door.config.policy.min")} name="minCount" type="number" min={0} value={editing?.minCount ?? ""} />
        <TextField label={t("door.config.policy.max")} name="maxCount" type="number" min={0} value={editing?.maxCount ?? ""} />
        <CheckField label={t("door.config.policy.requireAll")} name="requireAll" checked={editing?.requireAll ?? false} />
      </SaveForm>}
    </LoadState>
  );
}

export function LinksEditor({ systemId, version, canWrite }: Props) {
  const t = useT();
  const versionId = version?.id;
  const editable = canWrite && systemId === "sys-music" && version?.status === "DRAFT";
  const list = useLoad(() => fetchChoirCategoryLinks(systemId, versionId), `sched-config-links|${systemId}|${versionId ?? "active"}`);
  const categories = useLoad(() => fetchChoirCategories(systemId, false, versionId), `sched-config-link-cats|${versionId ?? "active"}`);
  const choirs = useChoirRegister(undefined, "sched-config-link-choirs");
  useChoirRegisterRefresh(list.reload);
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChoirCategoryLinkApi | null>(null);
  const rows = list.data?.links ?? [];
  const cancel = (clear = true) => { setEditing(null); setFormOpen(false); if (clear) state.clear(); };
  const submit = async (data: FormData) => {
    if (!versionId) return;
    const patch = {
      choirId: str(data, "choirId"), categoryId: str(data, "categoryId"),
      ...musicExceptions(data, editing),
      active: flag(data, "active"),
    };
    const ok = await state.run(
      () => editing ? updateChoirCategoryLink(editing.id, versionId, patch)
        : createChoirCategoryLink({ ...patch, systemId: "sys-music", configVersionId: versionId }),
      list.reload,
    );
    if (ok) cancel(false);
  };
  return (
    <LoadState loading={list.loading || categories.loading || choirs.loading}
      failed={list.failed || categories.failed || choirs.failed} retry={() => { list.reload(); categories.reload(); choirs.reload(); }}>
      <SectionNotice tone="warn">{t("door.config.link.behaviorNotice")}</SectionNotice>
      <p>{t('door.config.registerSync')} <Link to="/s/sys-music/choirs">{t('door.own.choirs')}</Link></p>
      {(choirs.data?.choirs ?? []).filter(choir => {
        if (!choir.active) return false;
        const link = rows.find(row => row.active && row.choirId === choir.id);
        if (!link) return true;
        const code = categories.data?.categories.find(row => row.id === link.categoryId)?.code?.toUpperCase();
        return code && ['PRIMARY','SECONDARY','CHILDREN','WORSHIP'].includes(code) && code !== choir.role;
      }).map(choir => <p className="door-error" key={choir.id}>{choir.name}: {t('door.config.needsCategory')}</p>)}
      {editable && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.links.empty" />
      <ul className="door-notices">{rows.map((row) => {
        const choir = choirs.data?.choirs.find((item) => item.id === row.choirId);
        const category = categories.data?.categories.find((item) => item.id === row.categoryId);
        return <li key={row.id} className="panel door-notice">
        <div className="door-notice-main">
          <strong>{t("door.config.link.pair", {
            choir: choir?.name ?? t("door.config.nameUnavailable.choir"),
            category: category?.name ?? t("door.config.nameUnavailable.category"),
          })}</strong>
          <p className="muted">{!choir ? t("door.config.registerMissing") : !choir.active ? t("door.music.retired") : row.active ? t("door.config.service.active") : t("door.config.service.inactive")}</p>
          {editable && <EditToggle onClick={() => { setEditing(row); setFormOpen(true); state.clear(); }} />}
        </div>
      </li>;
      })}</ul>
      {editable && formOpen && <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editLink") : t("door.config.addLink")}
        state={state} editing={!!editing} working={state.working} onCancel={cancel} onSubmit={submit}>
        <SelectField label={t("door.config.link.choir")} name="choirId" value={editing?.choirId} required
          options={(choirs.data?.choirs ?? []).filter((row) => row.active || row.id === editing?.choirId).map((row) => ({ value: row.id, label: row.name }))} />
        <SelectField label={t("door.config.link.category")} name="categoryId" value={editing?.categoryId} required
          options={(categories.data?.categories ?? []).map((row) => ({ value: row.id, label: row.name }))} />
        <ChoirExceptions versionId={versionId ?? ""} link={editing} />
        <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
      </SaveForm>}
    </LoadState>
  );
}

export function ProtocolRulesEditor({ systemId, version, canWrite }: Props) {
  const t = useT();
  const versionId = version?.id;
  const editable = canWrite && systemId === "sys-protocol" && version?.status === "DRAFT";
  const list = useLoad(() => fetchProtocolServiceRules(systemId, versionId), `sched-config-protocol|${systemId}|${versionId ?? "active"}`);
  const services = useLoad(() => fetchSchedulingServices("sys-protocol"), "sched-config-protocol-services");
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolServiceRuleApi | null>(null);
  const rows = list.data?.rules ?? [];
  const cancel = () => { setEditing(null); setFormOpen(false); state.clear(); };
  const submit = async (data: FormData) => {
    if (!versionId) return;
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
      () => editing ? updateProtocolServiceRule(editing.id, versionId, patch)
        : createProtocolServiceRule({ ...patch, systemId: "sys-protocol", configVersionId: versionId }),
      list.reload,
    );
    if (ok) cancel();
  };
  return (
    <LoadState loading={list.loading || services.loading} failed={list.failed || services.failed}
      retry={() => { list.reload(); services.reload(); }}>
      <SectionNotice>{t("door.config.protocol.behaviorNotice")}</SectionNotice>
      {editable && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
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

export function ProtocolDutyEditor({ systemId, version, canWrite }: Props) {
  const t = useT();
  const versionId = version?.id;
  const editable = canWrite && systemId === "sys-protocol" && version?.status === "DRAFT";
  const policy = useLoad(() => fetchProtocolDutyPolicy(systemId, versionId), `sched-config-duty|${systemId}|${versionId ?? "active"}`);
  const state = useSaveState();
  const row = policy.data?.policy ?? null;
  const submit = async (data: FormData) => {
    if (!versionId) return;
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
        ? updateProtocolDutyPolicy(row.id, versionId, patch)
        : createProtocolDutyPolicy({ ...patch, systemId: "sys-protocol", configVersionId: versionId }),
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

function ChoirExceptions({ versionId, link }: { versionId: string; link: ChoirCategoryLinkApi | null }) {
  const t = useT();
  const services = useLoad(() => fetchSchedulingServices('sys-music', true, versionId), 'sched-exceptions|' + versionId);
  return <fieldset><legend>{t('door.config.exceptions')}</legend><LoadState loading={services.loading} failed={services.failed} retry={services.reload}>
    {(services.data?.services ?? []).map(service => {
      const get = (map: Record<string, unknown> | undefined) => Object.entries(map ?? {}).find(([key]) => key.toLowerCase() === service.code.toLowerCase())?.[1];
      const eligible = get(link?.eligibleOverride);
      const frequency = get(link?.frequencyOverride) as Record<string, string | number> | undefined;
      return <fieldset key={service.code} className="scheduling-config-overrides"><legend>{service.name}</legend>
        <input type="hidden" name="exceptionCode" value={service.code} />
        <SelectField label={t('door.config.policy.eligible')} name={'eligible:' + service.code} value={eligible === undefined ? 'inherit' : eligible ? 'yes' : 'no'} options={[{value:'inherit',label:t('door.config.inherit')},{value:'yes',label:t('door.config.form.yes')},{value:'no',label:t('door.config.form.no')}]} />
        <TextField label={t('door.config.policy.target')} name={'target:' + service.code} type="number" min={1} value={frequency?.frequencyTarget ?? ''} />
        <SelectField label={t('door.config.policy.kind')} name={'kind:' + service.code} value={String(frequency?.frequencyKind ?? '')} options={[{value:'',label:t('door.config.inherit')}, ...['MINIMUM','TARGET','MAXIMUM'].map(value=>({value,label:t(('door.config.frequencyKind.' + value) as Parameters<typeof t>[0])}))]} />
        <SelectField label={t('door.config.policy.period')} name={'period:' + service.code} value={String(frequency?.frequencyPeriod ?? '')} options={[{value:'',label:t('door.config.inherit')}, ...['MONTH','QUARTER','HALF_YEAR','YEAR'].map(value=>({value,label:t(('door.config.period.' + value) as Parameters<typeof t>[0])}))]} />
      </fieldset>;
    })}
  </LoadState></fieldset>;
}
