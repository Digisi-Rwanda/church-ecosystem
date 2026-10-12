import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createTask,
  createWork,
  deleteWork,
  editWork,
  moveWork,
  upgradeWork,
  type DirectoryPerson,
  type WorkItem,
  type WorkOptions,
  type WorkStatus,
  type WorkVisibility,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { PersonPicker } from './PersonPicker';
import { Segmented } from './kit';
import { dueTimeToInput, dueToInput, hasDueTime, inputToDue, inputToDueTime, workActions, workErrorKey, workStatusKey } from './work';

/** Create a piece of work, or (with `existing`) change it. Owner and helpers are picked by name. */
export function WorkForm({
  options,
  systemId,
  existing,
  onDone,
  onCancel,
}: {
  options: WorkOptions;
  systemId: string;
  existing?: WorkItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(existing?.orgUnitId ?? (units.length === 1 ? units[0].id : ''));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(existing ? { id: existing.ownerId, name: existing.ownerName } : null);
  const [helpers, setHelpers] = useState<Array<{ id: string; name: string }>>(existing?.helpers ?? []);
  const [due, setDue] = useState(dueToInput(existing?.dueDate ?? null));
  const [visibility, setVisibility] = useState<WorkVisibility>(existing?.visibility ?? 'UNIT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !owner || (!existing && !unitId)) return setError(t('door.work.form.incomplete'));
    const input = {
      title: title.trim(),
      description: description.trim() || null,
      ownerId: owner.id,
      helperIds: helpers.map((h) => h.id),
      dueDate: due ? inputToDue(due) : null,
      visibility,
    };
    setBusy(true);
    setError('');
    try {
      if (existing) await editWork(existing.id, input);
      else await createWork(unitId, input);
      onDone();
    } catch (err) {
      setError(t(workErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  const pick = (p: DirectoryPerson, as: 'owner' | 'helper') => {
    const who = { id: p.id, name: p.fullName };
    if (as === 'owner') setOwner(who);
    else if (!helpers.some((h) => h.id === who.id) && helpers.length < options.limits.helpersMax) setHelpers([...helpers, who]);
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{existing ? t('door.work.form.edit') : t('door.work.form.new')}</h3>
      {!existing && units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="w-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.work.form.title')} name="w-title" value={title} maxLength={options.limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.work.form.description')} name="w-desc" rows={3} value={description} maxLength={options.limits.textMax} onChange={(e) => setDescription(e.target.value)} />
      <p>
        <strong>{t('door.work.form.owner')}:</strong> {owner ? owner.name : <span className="muted">{t('door.work.form.nobody')}</span>}
      </p>
      <PersonPicker label={t('door.work.form.pickOwner')} name="w-owner" onPick={(p) => pick(p, 'owner')} />
      {helpers.length > 0 && (
        <ul className="door-chips">
          {helpers.map((h) => (
            <li key={h.id}>
              <button type="button" className="door-chip" onClick={() => setHelpers(helpers.filter((x) => x.id !== h.id))} aria-label={t('door.work.form.removeHelper', { name: h.name })}>
                {h.name} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <PersonPicker label={t('door.work.form.pickHelper')} name="w-helper" onPick={(p) => pick(p, 'helper')} />
      <TextField label={t('door.work.form.due')} name="w-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <SelectField label={t('door.work.form.visibility')} name="w-vis" hint={t(`door.work.visibility.${visibility}.hint` as const)} value={visibility} onChange={(e) => setVisibility(e.target.value as WorkVisibility)}>
        {options.visibilities.map((v) => (
          <option key={v} value={v}>
            {t(`door.work.visibility.${v}` as const)}
          </option>
        ))}
      </SelectField>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {existing ? t('door.work.form.save') : t('door.work.form.create')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Create a task: a to-do for myself, or a specific task for someone else with a due time. */
export function TaskForm({ systemId, onDone, onCancel }: { systemId: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<'SELF' | 'OTHER'>('SELF');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const dueIso = due ? inputToDueTime(due) : null;
    if (!title.trim() || (mode === 'OTHER' && (!who || !dueIso))) return setError(t(mode === 'OTHER' ? 'door.work.task.incompleteOther' : 'door.work.form.incomplete'));
    setBusy(true);
    setError('');
    try {
      await createTask(mode, systemId, {
        title: title.trim(),
        description: description.trim() || null,
        ownerId: mode === 'OTHER' ? who!.id : null,
        helperIds: [],
        dueDate: dueIso,
        visibility: mode === 'SELF' ? 'PERSONS' : 'UNIT',
      });
      onDone();
    } catch (err) {
      setError(t(workErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <Segmented
        label={t('door.work.task.kind')}
        value={mode}
        onChange={setMode}
        items={[{ key: 'SELF', label: t('door.work.task.self') }, { key: 'OTHER', label: t('door.work.task.other') }]}
      />
      <p className="muted">{t(mode === 'SELF' ? 'door.work.task.selfHint' : 'door.work.task.otherHint')}</p>
      <TextField label={t('door.work.form.title')} name="t-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.work.form.description')} name="t-desc" rows={3} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
      {mode === 'OTHER' && (
        <>
          <p>
            <strong>{t('door.work.task.assignee')}:</strong> {who ? who.name : <span className="muted">{t('door.work.form.nobody')}</span>}
          </p>
          <PersonPicker label={t('door.work.task.pickAssignee')} name="t-who" onPick={(p) => setWho({ id: p.id, name: p.fullName })} />
        </>
      )}
      <TextField
        label={t(mode === 'OTHER' ? 'door.work.task.dueRequired' : 'door.work.task.dueOptional')}
        name="t-due"
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.work.form.create')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** One piece of work with its next steps. Delete asks first and is worded as final. */
export function WorkCard({ item, options, systemId, onChange }: { item: WorkItem; options: WorkOptions | undefined; systemId: string; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<'DONE' | 'CANCELLED' | null>(null);
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setClosing(null);
      setNote('');
      setDeleting(false);
      setUpgrading(false);
      onChange();
    } catch (err) {
      setError(t(workErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const move = (s: WorkStatus, n?: string) => run(() => moveWork(item.id, s, n));

  if (editing && options) {
    return (
      <li>
        <WorkForm options={options} systemId={systemId} existing={item} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }
  const due = item.dueDate ? new Intl.DateTimeFormat(locale, hasDueTime(item.dueDate) ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kigali' } : { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(item.dueDate)) : null;

  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{item.title}</strong>
          <span className={`door-chip${item.status === 'DONE' ? '' : item.overdue ? ' warn' : ''}`}>{t(workStatusKey(item.status))}</span>
          <span className="door-chip">{t(`door.work.visibility.${item.visibility}` as const)}</span>
        </div>
        <p className="muted">
          {item.ownerName}
          {item.helpers.length > 0 ? ` + ${item.helpers.map((h) => h.name).join(', ')}` : ''}
          {item.unitName ? ` · ${item.unitName}` : ''}
          {due ? ` · ${t('door.work.dueOn', { date: due })}` : ''}
          {item.overdue ? ` · ${t('door.work.overdue')}` : ''}
        </p>
        {item.description && <p>{item.description}</p>}
        {item.outcomeNote && <p>{t('door.work.outcome', { note: item.outcomeNote })}</p>}
        {item.planId && (<p><Link to={`/s/${item.systemId}/work/plans/${item.planId}`}>{t('door.work.upgrade.open')}</Link></p>)}
        <div className="door-row">
          {workActions(item).map((a) => (
            <button
              key={a}
              type="button"
              className={a === 'cancel' ? 'btn ghost sm' : 'btn secondary sm'}
              onClick={() => {
                if (a === 'done') setClosing('DONE');
                else if (a === 'cancel') setClosing('CANCELLED');
                else void move(a === 'start' ? 'IN_PROGRESS' : a === 'back' ? 'TODO' : item.status === 'CANCELLED' ? 'TODO' : 'IN_PROGRESS');
              }}
            >
              {t(`door.work.action.${a}` as const)}
            </button>
          ))}
          {item.canManage && item.status !== 'DONE' && options && (
            <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
              {t('door.work.form.edit')}
            </button>
          )}
          {item.canUpgrade && !upgrading && (<button type="button" className="btn ghost sm" onClick={() => setUpgrading(true)}>{t('door.work.upgrade')}</button>)}
          {item.canDelete && !deleting && (
            <button type="button" className="btn ghost sm" onClick={() => setDeleting(true)}>
              {t('door.work.delete')}
            </button>
          )}
        </div>
        {closing && (
          <div className="door-form">
            <TextAreaField label={closing === 'DONE' ? t('door.work.outcomeAsk') : t('door.work.cancelAsk')} name={`n-${item.id}`} rows={2} value={note} maxLength={options?.limits.noteMax ?? 2000} onChange={(e) => setNote(e.target.value)} />
            <div className="door-row">
              <button type="button" className="btn sm" disabled={!note.trim()} onClick={() => void move(closing, note.trim())}>
                {closing === 'DONE' ? t('door.work.action.done') : t('door.work.action.cancel')}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setClosing(null)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        )}
        {upgrading && (<div className="door-form" role="alertdialog" aria-label={t('door.work.upgrade')}><p>{t('door.work.upgrade.warn')}</p><div className="door-row"><button type="button" className="btn sm" onClick={() => void run(async () => { const r = await upgradeWork(item.id); navigate(`/s/${item.systemId}/work/plans/${r.planId}`); })}>{t('door.work.upgrade.confirm')}</button><button type="button" className="btn ghost sm" onClick={() => setUpgrading(false)}>{t('door.settings.cancel')}</button></div></div>)}
        {deleting && (
          <div className="door-form" role="alertdialog" aria-label={t('door.work.delete')}>
            <p>{t('door.work.deleteWarn')}</p>
            <div className="door-row">
              <button type="button" className="btn sm" onClick={() => void run(() => deleteWork(item.id))}>
                {t('door.work.deleteConfirm')}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setDeleting(false)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
