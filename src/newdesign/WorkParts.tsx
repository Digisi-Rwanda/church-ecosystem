import { useState, type FormEvent } from 'react';
import {
  createWork,
  deleteWork,
  editWork,
  moveWork,
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
import { dueToInput, inputToDue, workActions, workErrorKey, workStatusKey } from './work';

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

/** One piece of work with its next steps. Delete asks first and is worded as final. */
export function WorkCard({ item, options, systemId, onChange }: { item: WorkItem; options: WorkOptions | undefined; systemId: string; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<'DONE' | 'CANCELLED' | null>(null);
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setClosing(null);
      setNote('');
      setDeleting(false);
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
  const due = item.dueDate ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(item.dueDate)) : null;

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
